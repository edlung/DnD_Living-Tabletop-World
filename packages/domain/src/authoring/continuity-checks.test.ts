import type { AuthoringPreview } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import type { ResolvedProposable } from '../kernel/decision.ts';
import { encounterHere } from './continuity/geography.ts';
import {
  DM,
  TESTIMONY,
  TOMAS,
  authoringWorld,
  codeOf,
  testimony,
  tomas,
  type AuthoringWorld,
} from './testing/world.ts';

/**
 * The checks Stage 120 adds (docs/adr/0019-continuity-engine.md §2, owner
 * decision): what blocks, what warns, and what is only noted, each with its
 * explanation. Options and the premise event are in `options.test.ts`.
 */
const keys = (preview: AuthoringPreview) => preview.warnings.map((warning) => warning.key);
const issueCodes = (preview: AuthoringPreview) =>
  preview.issues.map((issue) => [issue.commandIndex, issue.code]);

const kill = (world: AuthoringWorld, entityId: string) =>
  world.submit({ type: 'ChangeEntityStatus', entityId, status: 'dead' }, DM);

/** A record Mira would hold, about the caravan only (no place, so no witness check). */
const miraKnows = (changes: Partial<Extract<ResolvedProposable, { type: 'AddKnowledge' }>> = {}) =>
  testimony({
    knowledgeId: 'mira-new',
    scope: { kind: 'NPC', npcId: 'mira-vale' },
    attributedTo: 'mira-vale',
    subjects: ['guild-caravan'],
    statement: 'The caravan wheels were freshly greased.',
    ...changes,
  });

describe('time', () => {
  it('blocks knowledge an NPC would learn after dying', async () => {
    const world = await authoringWorld();
    await kill(world, 'mira-vale');
    const { clock } = await world.state();
    const preview = await world.preview([miraKnows({ knownSince: clock })]);

    expect(issueCodes(preview)).toEqual([[0, 'KNOWN_AFTER_DEATH']]);
    expect(preview.issues[0]?.message).toMatch(
      /Mira Vale would learn it Day 1 10:00:00, after dying/,
    );
    expect(preview.committable).toBe(false);
  });

  it('allows what the dead learned while alive', async () => {
    const world = await authoringWorld();
    await kill(world, 'mira-vale');
    const preview = await world.preview([miraKnows({ knownSince: null })]);

    expect(preview).toMatchObject({ committable: true, issues: [] });
  });

  it('warns about testimony heard from someone already dead', async () => {
    const world = await authoringWorld();
    await kill(world, 'mira-vale');
    const { clock } = await world.state();
    const preview = await world.preview([
      tomas(),
      testimony({ attributedTo: 'mira-vale', subjects: ['guild-caravan'], knownSince: clock }),
    ]);

    expect(keys(preview)).toEqual(['SPEAKER_NOT_ALIVE@1:mira-vale']);
    expect(preview.committable).toBe(true);
  });

  it('warns about moving the dead', async () => {
    const world = await authoringWorld();
    await kill(world, 'mira-vale');
    const preview = await world.preview([
      { type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'golden-stag-inn' },
    ]);

    expect(keys(preview)).toEqual(['MOVES_THE_DEAD@0:mira-vale']);
  });
});

describe('rules and geography', () => {
  it('warns when an NPC appears where a fight runs, unless it is in the fight', async () => {
    const world = await authoringWorld();
    const before = await world.state();
    const state = {
      ...before,
      encounter: {
        locationId: 'north-gate',
        combatants: [{ entityId: 'captain-thorne' }, { entityId: 'elowen-starwhisper' }],
      },
    } as unknown as typeof before;
    const input = {
      before,
      state,
      history: [],
      commands: [tomas()],
      applied: new Set([0]),
      open: new Set<string>(),
    };

    expect(encounterHere(input, tomas(), 0).map((warning) => warning.key)).toEqual([
      `ENCOUNTER_HERE@0:${TOMAS}`,
    ]);
    const thorne = {
      type: 'PlaceEntity',
      entityId: 'captain-thorne',
      locationId: 'north-gate',
    } as const;
    expect(encounterHere({ ...input, commands: [thorne] }, thorne, 0)).toEqual([]);
  });
});

describe('identity and knowledge', () => {
  it('warns about an account the NPC already holds', async () => {
    const world = await authoringWorld();
    const preview = await world.preview([
      miraKnows({ statement: '  the caravan left before DAWN. ', knownSince: null }),
    ]);

    expect(keys(preview)).toEqual(['DUPLICATE_ACCOUNT@0:mira-departure']);
    expect(preview.warnings[0]?.knowledgeIds).toEqual(['mira-departure', 'mira-new']);
  });
});

describe('relationships', () => {
  it('authors an attitude at L2, and refuses non-NPCs and the dead', async () => {
    const world = await authoringWorld();
    const friendly = await world.preview([
      { type: 'SetRelationship', npcId: 'mira-vale', attitude: 'FRIENDLY' },
    ]);
    const place = await world.preview([
      { type: 'SetRelationship', npcId: 'north-gate', attitude: 'WARY' },
    ]);
    await kill(world, 'orin-stonebeard');
    const dead = await world.preview([
      { type: 'SetRelationship', npcId: 'orin-stonebeard', attitude: 'WARY' },
    ]);

    expect(friendly).toMatchObject({ committable: true, risk: { level: 'L2' } });
    expect(issueCodes(place)).toEqual([[0, 'UNSUPPORTED_OPERATION']]);
    expect(issueCodes(dead)).toEqual([[0, 'TARGET_DEAD']]);
  });

  it('warns when a hostile or wary NPC is made willing to share', async () => {
    const world = await authoringWorld();
    const preview = await world.preview([
      { type: 'SetRelationship', npcId: 'orin-stonebeard', attitude: 'HOSTILE' },
      { type: 'SetDisclosure', knowledgeId: 'orin-prior-incident', disclosure: 'WILLING' },
    ]);
    await world.submit({ type: 'SetRelationship', npcId: 'orin-stonebeard', attitude: 'WARY' }, DM);
    const wary = await world.preview([
      { type: 'SetDisclosure', knowledgeId: 'orin-prior-incident', disclosure: 'WILLING' },
    ]);

    expect(keys(preview)).toEqual(['DISCLOSURE_AGAINST_ATTITUDE@1:orin-stonebeard']);
    expect(keys(wary)).toEqual(['DISCLOSURE_AGAINST_ATTITUDE@0:orin-stonebeard']);
    // Orin's record is about the secret symbol, so sharing it is L3.
    expect(wary.risk.level).toBe('L3');
  });
});

describe('lore as claims (§4)', () => {
  const claimed = (value: string, aspect = 'departure-time'): ResolvedProposable => ({
    type: 'SetClaim',
    target: { kind: 'knowledge', knowledgeId: TESTIMONY },
    claim: { subjectId: 'guild-caravan', aspect, value },
  });

  it('notes the accounts a claim agrees with and warns about those it contradicts', async () => {
    const world = await authoringWorld();
    const preview = await world.preview([tomas(), testimony(), claimed('before-dawn')]);

    expect(preview.notes.map((note) => note.knowledgeIds[1])).toEqual([
      'mira-departure',
      'party-mira-departure',
    ]);
    expect(keys(preview)).toEqual(['CLAIM_CONFLICT@2:thorne-departure']);
    expect(preview.warnings[0]?.message).toBe(
      "About Merchant Guild caravan (departure-time): this says before-dawn; Captain Thorne's account (thorne-departure) says after-sunrise",
    );
    expect(preview).toMatchObject({ committable: true, risk: { level: 'L2' } });
  });

  it('compares with DM claims on world truth, which players never meet', async () => {
    const world = await authoringWorld();
    const truth = await world.submit(
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId: 'truth-cargo' },
        claim: { subjectId: 'guild-caravan', aspect: 'cargo', value: 'rare-reagents' },
      },
      DM,
    );
    expect(codeOf(truth)).toBe('accepted');
    const preview = await world.preview([tomas(), testimony(), claimed('grain', 'cargo')]);

    expect(keys(preview)).toEqual(['CLAIM_CONFLICT@2:truth-cargo']);
    expect(preview.warnings[0]?.message).toContain(
      'the world truth (truth-cargo) says rare-reagents',
    );
    // The commit records no contradiction: world truth is never joined (ADR 0014 §2).
    expect(preview.changes.map((change) => change.type)).not.toContain('ContradictionDetected');
  });

  it('refuses claims on clues and on records outside an NPC', async () => {
    const world = await authoringWorld();
    const clue = await world.preview([
      {
        type: 'SetClaim',
        target: { kind: 'clue', clueId: 'clue-tracks-boots' },
        claim: { subjectId: 'feature-ccec7e50', aspect: 'maker', value: 'boots' },
      },
    ]);
    const party = await world.preview([
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId: 'party-goblin-hypothesis' },
        claim: { subjectId: 'guild-caravan', aspect: 'attacker', value: 'goblins' },
      },
    ]);

    expect(issueCodes(clue)).toEqual([[0, 'UNSUPPORTED_OPERATION']]);
    expect(issueCodes(party)).toEqual([[0, 'UNSUPPORTED_OPERATION']]);
  });
});
