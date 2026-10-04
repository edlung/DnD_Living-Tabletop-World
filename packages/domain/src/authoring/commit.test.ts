import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { MODIFIERS } from '../investigation/testing/world.ts';
import type { Actor } from '../kernel/actor.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import {
  CAMPAIGN,
  DM,
  OUTSIDER,
  PLAYER,
  TESTIMONY,
  TOMAS,
  authoringWorld,
  codeOf,
  commitIdOf,
  confirm,
  testimony,
  tomas,
  tomasProposal,
  type AuthoringWorld,
} from './testing/world.ts';

/**
 * Committing proposals through the World Engine (docs/adr/0018-ai-authoring.md
 * §4, §6): one command or nothing, the DM's consent checked against the state
 * at commit, and provenance on the command record.
 */
const SYSTEM: Actor = { actorId: 'system', kind: 'system' };

const detailsOf = (result: CommandResult) =>
  result.status === 'rejected' ? (result.details ?? {}) : {};

async function oracle(world: AuthoringWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  const log = await world.engine.commandLog(CAMPAIGN);
  return redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0);
}

describe('the Tomas commit', () => {
  it('applies the whole proposal as one command, with its provenance', async () => {
    const world = await authoringWorld();
    const preview = await world.preview(tomasProposal());
    const result = await world.commit(tomasProposal(), { confirmation: confirm('L2') });

    expect(codeOf(result)).toBe('accepted');
    const state = await world.state();
    expect(state.entities.get(TOMAS)).toMatchObject({
      kind: 'npc',
      name: 'Tomas Reed',
      placement: { locationId: 'north-gate', since: null },
    });
    expect(state.knowledge.get(TESTIMONY)).toMatchObject({
      scope: { kind: 'NPC', npcId: TOMAS },
      knowledgeType: 'TESTIMONY',
      attributedTo: TOMAS,
    });
    expect(state.investigation.disclosures.get(TESTIMONY)).toBe('WILLING');

    const snapshot = await world.engine.load(CAMPAIGN);
    const events = (snapshot?.history ?? []).filter(
      (event) => event.causation.commandId === result.commandId,
    );
    expect(events.map(({ type, payload }) => ({ type, payload }))).toEqual(preview.changes);
    expect(new Set(events.map((event) => event.causation.commandType))).toEqual(
      new Set(['ApplyAuthoring']),
    );

    const record = (await world.engine.commandLog(CAMPAIGN)).find(
      (stored) => stored.commandId === commitIdOf(result.proposalId),
    );
    expect(record?.actor).toEqual(DM);
    expect(record?.command).toMatchObject({
      type: 'ApplyAuthoring',
      proposalId: result.proposalId,
      revision: 1,
      source: { kind: 'dm' },
      confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] },
    });
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(await oracle(world)).toBeNull();
  });

  it('resolves missing knowledge IDs at commit and records them', async () => {
    const world = await authoringWorld();
    const result = await world.engine.execute({
      commandId: 'authoring.unidentified',
      campaignId: CAMPAIGN,
      actor: DM,
      command: {
        type: 'ApplyAuthoring',
        proposalId: '00000000-0000-4000-8000-0000000000c1',
        revision: 1,
        summary: 'Tomas, with a record the engine names.',
        source: { kind: 'dm' },
        commands: [
          tomas(),
          {
            type: 'AddKnowledge',
            scope: { kind: 'NPC', npcId: TOMAS },
            knowledgeType: 'TESTIMONY',
            statement: 'I saw the caravan leave.',
            subjects: ['guild-caravan'],
            attributedTo: TOMAS,
            knownSince: null,
          },
        ],
        confirmation: confirm('L2'),
      },
    });

    expect(codeOf(result)).toBe('accepted');
    const record = (await world.engine.commandLog(CAMPAIGN)).find(
      (stored) => stored.commandId === result.commandId,
    );
    const operation = record?.command.type === 'ApplyAuthoring' ? record.command.commands[1] : null;
    expect(operation?.type === 'AddKnowledge' ? operation.knowledgeId : null).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});

describe('atomic rejection (invariant 17)', () => {
  it.each([
    [
      'a later operation is illegal',
      [tomas(), testimony({ subjects: ['nowhere'] })],
      'AUTHORING_INVALID',
    ],
    [
      'an operation is not enabled',
      [
        tomas(),
        { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' } as const,
      ],
      'AUTHORING_UNSUPPORTED',
    ],
    [
      'continuity is broken',
      [
        tomas({ existsSince: 0 }),
        testimony({ knownSince: 0, subjects: ['guild-caravan'] }),
        {
          type: 'CreateEntity',
          entityId: 'later',
          kind: 'npc',
          name: 'Later',
          existsSince: 3_600,
        } as const,
        testimony({ knowledgeId: 'about-later', subjects: ['later'], knownSince: 60 }),
      ],
      'AUTHORING_INVALID',
    ],
  ])('changes nothing when %s', async (_label, commands, code) => {
    const world = await authoringWorld();
    const before = await world.version();
    const result = await world.commit(commands, { confirmation: confirm('L3') });

    expect(codeOf(result)).toBe(code);
    expect(detailsOf(result)).toHaveProperty('issues');
    expect(await world.version()).toBe(before);
    const state = await world.state();
    expect(state.entities.has(TOMAS)).toBe(false);
    expect(state.usedIds.has(TOMAS)).toBe(false);
    expect(state.entities.get('orin-stonebeard')?.status).toBe('active');
  });

  it('rejects malformed proposals before deciding anything', async () => {
    const world = await authoringWorld();
    const before = await world.version();
    const result = await world.engine.execute({
      commandId: 'authoring.malformed',
      campaignId: CAMPAIGN,
      actor: DM,
      command: { type: 'ApplyAuthoring', proposalId: 'x', commands: [{ type: 'Nonsense' }] },
    });

    expect(codeOf(result)).toBe('INVALID_COMMAND');
    expect(await world.version()).toBe(before);
  });
});

describe('confirmation (owner decision: always, ADR 0018 §4)', () => {
  it('refuses a commit without a confirmation', async () => {
    const world = await authoringWorld();
    const result = await world.engine.execute({
      commandId: 'authoring.unconfirmed',
      campaignId: CAMPAIGN,
      actor: DM,
      command: {
        type: 'ApplyAuthoring',
        proposalId: '00000000-0000-4000-8000-0000000000aa',
        revision: 1,
        summary: 'Tomas',
        source: { kind: 'dm' },
        commands: tomasProposal(),
      },
    });

    expect(codeOf(result)).toBe('INVALID_COMMAND');
  });

  it('refuses a confirmation below the risk level or missing a warning', async () => {
    const world = await authoringWorld();
    const before = await world.version();
    const low = await world.commit(tomasProposal(), { confirmation: confirm('L1') });
    const named = [tomas({ name: 'Captain Thorne' }), testimony()];
    const unacknowledged = await world.commit(named, { confirmation: confirm('L3') });

    expect(codeOf(low)).toBe('CONFIRMATION_REQUIRED');
    expect(detailsOf(low)).toMatchObject({
      required: { riskLevel: 'L2', warnings: [] },
      missing: { riskLevel: 'L2', warnings: [] },
    });
    expect(codeOf(unacknowledged)).toBe('CONFIRMATION_REQUIRED');
    expect(detailsOf(unacknowledged)).toMatchObject({ missing: { warnings: ['NAME_IN_USE@0'] } });
    expect(await world.version()).toBe(before);

    const acknowledged = await world.commit(named, {
      confirmation: confirm('L2', ['NAME_IN_USE@0']),
    });
    expect(codeOf(acknowledged)).toBe('accepted');
  });

  it('accepts a confirmation above the level or acknowledging more than needed', async () => {
    const world = await authoringWorld();
    const result = await world.commit(tomasProposal(), {
      confirmation: confirm('L3', ['NAME_IN_USE@0']),
    });

    expect(codeOf(result)).toBe('accepted');
  });
});

describe('permission (invariant 3)', () => {
  it.each<[string, Actor]>([
    ['a player', PLAYER],
    ['a non-member', OUTSIDER],
    ['the system actor', SYSTEM],
  ])('refuses %s', async (_label, actor) => {
    const world = await authoringWorld();
    const before = await world.version();
    const result = await world.commit(tomasProposal(), { actor, confirmation: confirm('L3') });

    expect(codeOf(result)).toBe('FORBIDDEN');
    expect(await world.version()).toBe(before);
  });
});

describe('stale previews are revalidated at commit', () => {
  it('needs a new confirmation when a warning appeared since the preview', async () => {
    const world = await authoringWorld();
    const preview = await world.preview(tomasProposal());
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: 'other-tomas',
        kind: 'npc',
        name: 'Tomas Reed',
        existsSince: null,
      },
      DM,
    );
    const stale = preview.confirmation ?? confirm('L1');
    const result = await world.commit(tomasProposal(), { confirmation: stale });

    expect(codeOf(result)).toBe('CONFIRMATION_REQUIRED');
    const fresh = await world.preview(tomasProposal());
    expect(fresh.confirmation?.acknowledgedWarnings).toEqual(['NAME_IN_USE@0']);
    expect(
      codeOf(await world.commit(tomasProposal(), { confirmation: fresh.confirmation ?? stale })),
    ).toBe('accepted');
  });

  it('rejects what became illegal since the preview', async () => {
    const world = await authoringWorld();
    const preview = await world.preview(tomasProposal());
    await world.submit(
      { type: 'ChangeEntityStatus', entityId: 'north-gate', status: 'destroyed' },
      DM,
    );
    const before = await world.version();
    const result = await world.commit(tomasProposal(), {
      confirmation: preview.confirmation ?? confirm('L3'),
    });

    expect(codeOf(result)).toBe('AUTHORING_INVALID');
    // Tomas cannot be placed; his testimony and its disclosure then have no holder.
    expect(detailsOf(result)).toMatchObject({
      issues: [
        { commandIndex: 0, code: 'ENTITY_DESTROYED' },
        { commandIndex: 1, code: 'ENTITY_NOT_FOUND' },
        { commandIndex: 2, code: 'KNOWLEDGE_NOT_FOUND' },
      ],
    });
    expect(await world.version()).toBe(before);
  });

  it('commits when only unrelated things changed', async () => {
    const world = await authoringWorld();
    const preview = await world.preview(tomasProposal());
    await world.submit({ type: 'AdvanceWorldTime', by: 3_600 }, DM);

    const result = await world.commit(tomasProposal(), {
      confirmation: preview.confirmation ?? confirm('L3'),
    });
    expect(codeOf(result)).toBe('accepted');
  });
});

describe('idempotency and concurrency', () => {
  it('returns the original outcome for a retried commit and refuses a second revision', async () => {
    const world = await authoringWorld();
    const first = await world.commit(tomasProposal(), { confirmation: confirm('L2') });
    const retry = await world.commit(tomasProposal(), {
      proposalId: first.proposalId,
      confirmation: confirm('L2'),
    });
    const edited = await world.commit([tomas({ description: 'Edited.' }), testimony()], {
      proposalId: first.proposalId,
      revision: 2,
      confirmation: confirm('L2'),
    });

    expect(codeOf(retry)).toBe('duplicate');
    expect(codeOf(edited)).toBe('COMMAND_ID_CONFLICT');
  });

  it('accepts one of two conflicting commits racing on the same campaign', async () => {
    const world = await authoringWorld();
    const rival = new WorldEngine({
      store: world.store,
      ids: new SequentialIds(7),
      clock: new SteppingClock(),
    });
    const command = (proposalId: string, name: string) => ({
      commandId: commitIdOf(proposalId),
      campaignId: CAMPAIGN,
      actor: DM,
      command: {
        type: 'ApplyAuthoring',
        proposalId,
        revision: 1,
        summary: name,
        source: { kind: 'dm' },
        commands: [tomas({ name })],
        confirmation: confirm('L3'),
      },
    });
    const results = await Promise.all([
      world.engine.execute(command('00000000-0000-4000-8000-0000000000b1', 'Tomas Reed')),
      rival.execute(command('00000000-0000-4000-8000-0000000000b2', 'Tomas Reeve')),
    ]);

    expect(results.map(codeOf).sort()).toEqual(['AUTHORING_INVALID', 'accepted']);
    const state = await world.state();
    expect(state.entities.get(TOMAS)?.name).toMatch(/^Tomas Ree(d|ve)$/);
    expect(checkWorldIntegrity(state)).toEqual([]);
  });
});
