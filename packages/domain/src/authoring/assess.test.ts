import type { AuthoringPreview } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ResolvedProposable } from '../kernel/decision.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import {
  ASHEN_CIRCLE,
  DEPARTURE,
  ELOWEN,
  TESTIMONY,
  TOMAS,
  authoringWorld,
  testimony,
  tomas,
  tomasProposal,
  type AuthoringWorld,
} from './testing/world.ts';

/**
 * What authoring may apply, at which risk, and the continuity checks
 * (docs/adr/0018-ai-authoring.md §2–§4), through the DM's preview, which
 * runs the same decision a commit gets.
 */
let world: AuthoringWorld;
beforeAll(async () => {
  world = await authoringWorld();
});

const issueCodes = (preview: AuthoringPreview) =>
  preview.issues.map((issue) => [issue.commandIndex, issue.code]);
const warningKeys = (preview: AuthoringPreview) => preview.warnings.map((warning) => warning.key);

describe('the Tomas acceptance case', () => {
  it('passes every check at L2 with nothing to acknowledge', async () => {
    const preview = await world.preview(tomasProposal());

    expect(preview).toMatchObject({
      committable: true,
      issues: [],
      warnings: [],
      risk: { level: 'L2' },
      confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] },
    });
    expect(preview.changes.map((change) => change.type)).toEqual([
      'EntityCreated',
      'EntityPlaced',
      'KnowledgeAssigned',
      'DisclosureSet',
      // Tomas is an NPC: the commit queues his visual reference (ADR 0022 §2).
      'AssetRequested',
    ]);
    expect(preview.risk.reasons.map((reason) => reason.level)).toEqual(['L2', 'L2', 'L2']);
  });
});

describe('enabled operations (owner decision, §2)', () => {
  it.each<[string, ResolvedProposable, string]>([
    ['a death', { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' }, 'L4'],
    ['a time advance', { type: 'AdvanceWorldTime', by: 3_600 }, 'L4'],
    [
      'a new location',
      {
        type: 'CreateEntity',
        entityId: 'watchtower',
        kind: 'location',
        name: 'Watchtower',
        existsSince: null,
        location: { type: 'building', parentId: 'ravenford' },
      },
      'L3',
    ],
    [
      'a new item',
      {
        type: 'CreateEntity',
        entityId: 'lantern',
        kind: 'item',
        name: 'Lantern',
        existsSince: null,
      },
      'L3',
    ],
    ['public knowledge', testimony({ scope: { kind: 'PUBLIC' }, knowledgeType: 'RUMOR' }), 'L3'],
    ['world truth', testimony({ scope: { kind: 'WORLD_TRUTH' }, knowledgeType: 'FACT' }), 'L3'],
    ['party knowledge', testimony({ scope: { kind: 'PARTY' } }), 'L3'],
    ['a hypothesis for an NPC', testimony({ knowledgeType: 'HYPOTHESIS' }), 'L3'],
    [
      'moving an item',
      { type: 'PlaceEntity', entityId: 'item-0869f47a', locationId: 'market-square' },
      'L3',
    ],
    [
      'renaming a place',
      { type: 'UpdateEntityProfile', entityId: 'north-gate', name: 'Old Gate' },
      'L3',
    ],
  ])('refuses %s', async (_label, operation, level) => {
    const preview = await world.preview([tomas(), operation]);

    expect(preview.committable).toBe(false);
    expect(issueCodes(preview)).toContainEqual([1, 'UNSUPPORTED_OPERATION']);
    expect(preview.risk.reasons[1]?.level).toBe(level);
    expect(preview.confirmation).toBeNull();
    expect(preview.changes).toEqual([]);
  });

  it('allows the NPC edits at L1', async () => {
    const preview = await world.preview([
      { type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'golden-stag-inn' },
      {
        type: 'UpdateEntityProfile',
        entityId: 'mira-vale',
        description: 'A merchant, tired today.',
      },
      { type: 'SetDisclosure', knowledgeId: 'thorne-departure', disclosure: 'GUARDED' },
    ]);

    expect(preview).toMatchObject({ committable: true, risk: { level: 'L1' } });
  });
});

describe('risk (owner decision, §4)', () => {
  it('rates a secret, or a record about a non-public entity, L3', async () => {
    const secret = await world.preview([
      tomas(),
      testimony({ knowledgeType: 'SECRET', attributedTo: undefined }),
    ]);
    const hidden = await world.preview([tomas(), testimony({ subjects: [ASHEN_CIRCLE] })]);

    expect(secret.risk.level).toBe('L3');
    expect(hidden.risk.level).toBe('L3');
  });

  it('rates sharing a record about a non-public entity L3', async () => {
    const preview = await world.preview([
      { type: 'SetDisclosure', knowledgeId: 'orin-prior-incident', disclosure: 'WILLING' },
    ]);

    expect(preview).toMatchObject({ committable: true, risk: { level: 'L3' } });
  });
});

describe('timeline', () => {
  it('blocks existence after the world clock', async () => {
    const state = await world.state();
    const preview = await world.preview([tomas({ existsSince: state.clock + 60 })]);

    expect(issueCodes(preview)).toEqual([[0, 'TEMPORAL_CONFLICT']]);
  });

  it('blocks knowledge learned before its holder existed', async () => {
    const preview = await world.preview([
      tomas({
        existsSince: worldTimeAt(0, 8),
        placement: { locationId: 'north-gate', since: worldTimeAt(0, 8) },
      }),
      testimony({ knownSince: DEPARTURE }),
    ]);

    expect(issueCodes(preview)).toEqual([[1, 'TEMPORAL_CONFLICT']]);
  });

  it('blocks knowledge about a subject, or from a speaker, that did not exist yet', async () => {
    const ada = (since: number) =>
      ({
        type: 'CreateEntity',
        entityId: 'ada-brook',
        kind: 'npc',
        name: 'Ada Brook',
        existsSince: since,
      }) as const;
    const about = await world.preview([
      tomas(),
      ada(worldTimeAt(1, 8)),
      testimony({ subjects: ['ada-brook'], knownSince: DEPARTURE }),
    ]);
    const heard = await world.preview([
      tomas(),
      ada(worldTimeAt(1, 8)),
      testimony({ knowledgeType: 'RUMOR', attributedTo: 'ada-brook', knownSince: DEPARTURE }),
    ]);

    expect(issueCodes(about)).toEqual([[2, 'KNOWLEDGE_BEFORE_SUBJECT']]);
    expect(issueCodes(heard)).toEqual([[2, 'KNOWLEDGE_BEFORE_SUBJECT']]);
    expect(about.issues[0]?.message).toContain('Ada Brook');
  });

  it('warns when a witness was not at the place when he saw it', async () => {
    const arrivedLater = await world.preview([
      tomas({ placement: { locationId: 'north-gate', since: worldTimeAt(0, 8) } }),
      testimony({ knownSince: DEPARTURE }),
    ]);
    const thereBefore = await world.preview([
      tomas({ placement: { locationId: 'north-gate', since: worldTimeAt(-1, 4) } }),
      testimony({ knownSince: DEPARTURE }),
    ]);

    expect(warningKeys(arrivedLater)).toEqual([`WITNESS_ELSEWHERE@1:${TOMAS}`]);
    expect(arrivedLater.committable).toBe(true);
    expect(arrivedLater.confirmation?.acknowledgedWarnings).toEqual([
      `WITNESS_ELSEWHERE@1:${TOMAS}`,
    ]);
    expect(warningKeys(thereBefore)).toEqual([]);
  });

  it("uses an existing NPC's placement history, and location containment", async () => {
    const miraAtGate = await world.preview([
      testimony({
        knowledgeId: 'mira-saw-gate',
        scope: { kind: 'NPC', npcId: 'mira-vale' },
        attributedTo: 'mira-vale',
        subjects: ['north-gate'],
        knownSince: DEPARTURE,
      }),
    ]);
    const miraInTown = await world.preview([
      testimony({
        knowledgeId: 'mira-saw-town',
        scope: { kind: 'NPC', npcId: 'mira-vale' },
        attributedTo: 'mira-vale',
        subjects: ['ravenford'],
        knownSince: DEPARTURE,
      }),
    ]);

    expect(warningKeys(miraAtGate)).toEqual(['WITNESS_ELSEWHERE@0:mira-vale']);
    expect(warningKeys(miraInTown)).toEqual([]);
  });
});

describe('location', () => {
  it.each<[string, string, string]>([
    ['an unknown place', 'nowhere', 'ENTITY_NOT_FOUND'],
    ['something that is not a place', 'mira-vale', 'NOT_A_LOCATION'],
  ])('blocks placement at %s', async (_label, locationId, code) => {
    const preview = await world.preview([tomas({ placement: { locationId, since: null } })]);

    expect(issueCodes(preview)).toEqual([[0, code]]);
  });
});

describe('identity', () => {
  it('blocks a used ID, including one created earlier in the proposal', async () => {
    const taken = await world.preview([tomas({ entityId: 'captain-thorne' })]);
    const twice = await world.preview([tomas(), tomas({ name: 'Tomas Reed the Second' })]);

    expect(issueCodes(taken)).toEqual([[0, 'ID_ALREADY_USED']]);
    expect(issueCodes(twice)).toEqual([[1, 'ID_ALREADY_USED']]);
  });

  it("warns when an NPC gets another entity's name", async () => {
    const created = await world.preview([tomas({ name: 'captain  thorne' })]);
    const renamed = await world.preview([
      { type: 'UpdateEntityProfile', entityId: 'mira-vale', name: 'Orin Stonebeard' },
    ]);

    expect(warningKeys(created)).toEqual(['NAME_IN_USE@0']);
    expect(created.warnings[0]?.entityIds).toEqual([TOMAS, 'captain-thorne']);
    // Stage 120 adds that the party and the public know Mira (ADR 0019 §2).
    expect(warningKeys(renamed)).toEqual(['NAME_IN_USE@0', 'RENAME_KNOWN@0:mira-vale']);
  });
});

describe('scoped knowledge', () => {
  it('blocks a record whose holder is not an NPC, or testimony without a speaker', async () => {
    const character = await world.preview([
      testimony({ scope: { kind: 'NPC', npcId: ELOWEN }, attributedTo: ELOWEN }),
    ]);
    const unattributed = await world.preview([tomas(), testimony({ attributedTo: undefined })]);

    expect(issueCodes(character)).toEqual([[0, 'INVALID_KNOWLEDGE']]);
    expect(issueCodes(unattributed)).toEqual([[1, 'INVALID_KNOWLEDGE']]);
  });

  it('warns when an NPC would know about a secret entity', async () => {
    const preview = await world.preview([tomas(), testimony({ subjects: [ASHEN_CIRCLE] })]);

    expect(warningKeys(preview)).toEqual([`SECRET_SUBJECT@1:${ASHEN_CIRCLE}`]);
    expect(preview.confirmation).toEqual({
      riskLevel: 'L3',
      acknowledgedWarnings: [`SECRET_SUBJECT@1:${ASHEN_CIRCLE}`],
    });
  });

  it('blocks a disclosure for a record that is not an NPC record, or never shareable', async () => {
    const publicRecord = await world.preview([
      { type: 'SetDisclosure', knowledgeId: 'pub-ravenford-town', disclosure: 'WILLING' },
    ]);
    const secret = await world.preview([
      { type: 'SetDisclosure', knowledgeId: 'orin-symbol-secret', disclosure: 'WILLING' },
    ]);

    expect(issueCodes(publicRecord)).toEqual([[0, 'INVALID_DISCLOSURE']]);
    expect(issueCodes(secret)).toEqual([[0, 'INVALID_DISCLOSURE']]);
  });
});

describe('every issue is reported', () => {
  it('lists independent problems across the proposal', async () => {
    const preview = await world.preview([
      tomas({ placement: { locationId: 'nowhere', since: null } }),
      { type: 'AdvanceWorldTime', by: 60 },
      { type: 'SetDisclosure', knowledgeId: 'pub-ravenford-town', disclosure: 'WILLING' },
    ]);

    expect(issueCodes(preview)).toEqual([
      [0, 'ENTITY_NOT_FOUND'],
      [1, 'UNSUPPORTED_OPERATION'],
      [2, 'INVALID_DISCLOSURE'],
    ]);
  });

  it('reports a refused DM as a whole-proposal issue', async () => {
    const preview = await world.preview(tomasProposal(), {
      actorId: 'player-elowen',
      kind: 'user',
    });

    expect(preview).toMatchObject({
      committable: false,
      issues: [{ commandIndex: null, code: 'FORBIDDEN' }],
    });
  });
});

it('names the testimony the disclosure refers to', () => {
  expect(tomasProposal()[2]).toMatchObject({ knowledgeId: TESTIMONY });
});
