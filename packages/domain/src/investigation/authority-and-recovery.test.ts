import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import type { Actor } from '../kernel/actor.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Gate 02 retest 1 regressions (reviews/ASTRA_GATE_02_RETEST_1.md):
 * G02-H03 — a player action depends on the assignment that authorized it;
 * G02-M01 — an action that changed nothing must not strand dependency undo.
 */
const GUEST = 'guest-character';
const OUTSIDER: Actor = { actorId: 'outsider', kind: 'user' };

function accepted(result: CommandResult): string {
  if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
  return result.commandId;
}
const undo = (targetCommandId: string) => ({ type: 'UndoCommand', targetCommandId });

async function unsafeBlockers(
  world: InvestigationWorld,
  targetCommandId: string,
): Promise<string[]> {
  const before = await world.state();
  const result = await world.submit(undo(targetCommandId), DM);
  expect(codeOf(result)).toBe('UNDO_UNSAFE');
  expect(await world.state()).toEqual(before);
  const blockers =
    result.status === 'rejected' ? (result.details?.['blockers'] as { commandId: string }[]) : [];
  return blockers.map((blocker) => blocker.commandId);
}

async function consistent(world: InvestigationWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(replay(snapshot.history)).toEqual(snapshot.state);
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
}

async function guestWorld() {
  const world = await investigationWorld();
  accepted(
    await world.submit(
      {
        type: 'CreateEntity',
        entityId: GUEST,
        kind: 'character',
        name: 'Guest',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      },
      DM,
    ),
  );
  expect(
    codeOf(
      await world.submit(
        { type: 'EnterLocation', characterId: GUEST, locationId: 'market-square' },
        OUTSIDER,
      ),
    ),
  ).toBe('FORBIDDEN');
  const assignment = accepted(
    await world.submit(
      { type: 'AssignCharacter', characterId: GUEST, playerActorId: 'outsider' },
      DM,
    ),
  );
  return { world, assignment };
}

const ACTIONS = {
  'EnterLocation (public destination)': {
    type: 'EnterLocation',
    characterId: GUEST,
    locationId: 'market-square',
  },
  'EnterLocation (perceived destination)': {
    type: 'EnterLocation',
    characterId: GUEST,
    locationId: 'ravenford',
  },
  'FormHypothesis (CHARACTER, no subjects)': {
    type: 'FormHypothesis',
    characterId: GUEST,
    scope: 'CHARACTER',
    statement: 'A private guess.',
    subjects: [],
  },
} as const;

describe('undo_controlling_assignment_is_blocked_by_player_action', () => {
  it.each(Object.entries(ACTIONS))('%s', async (_label, action) => {
    const { world, assignment } = await guestWorld();
    const act = accepted(await world.submit(action, OUTSIDER));

    expect(await unsafeBlockers(world, assignment)).toEqual([act]);
    await consistent(world);

    // Reverse order is safe: undo the action, then the assignment.
    expect(codeOf(await world.submit(undo(act), DM))).toBe('accepted');
    expect(codeOf(await world.submit(undo(assignment), DM))).toBe('accepted');
    expect((await world.state()).roster.has(GUEST)).toBe(false);
    await consistent(world);
  });

  it('keeps DM-issued actions independent of any assignment', async () => {
    const { world, assignment } = await guestWorld();
    accepted(await world.submit(ACTIONS['EnterLocation (public destination)'], DM));
    expect(codeOf(await world.submit(undo(assignment), DM))).toBe('accepted');
    await consistent(world);
  });
});

describe('empty_inspection_does_not_strand_dependency_undo', () => {
  it('lets the DM unwind disclosure, move and an inspection that found nothing', async () => {
    const world = await investigationWorld();
    accepted(
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: 'empty-remote',
          kind: 'location',
          name: 'Empty remote',
          existsSince: null,
          location: { type: 'site', parentId: null },
        },
        DM,
      ),
    );
    const reveal = accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'empty-route',
          scope: { kind: 'PARTY' },
          knowledgeType: 'FACT',
          statement: 'Known empty-remote',
          subjects: ['empty-remote'],
          knownSince: 36000,
        },
        DM,
      ),
    );
    const move = accepted(
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: 'empty-remote',
      }),
    );
    const inspected = await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'empty-remote',
      method: 'inspect',
    });
    expect(inspected.status !== 'rejected' && inspected.outcome).toEqual({
      kind: 'ExamineEntity',
      roll: null,
      discovered: [],
    });
    const inspect = accepted(inspected);

    expect(await unsafeBlockers(world, reveal)).toEqual([move]);
    expect(await unsafeBlockers(world, move)).toEqual([inspect]);
    // The inspection changed nothing, yet it can be undone: history keeps it, canon no longer depends on it.
    expect(codeOf(await world.submit(undo(inspect), DM))).toBe('accepted');
    expect(codeOf(await world.submit(undo(move), DM))).toBe('accepted');
    expect(codeOf(await world.submit(undo(reveal), DM))).toBe('accepted');

    const state = await world.state();
    expect(state.commands.get(inspect)?.undoneBy).not.toBeNull();
    expect(state.entities.get(ELOWEN)?.placement?.locationId).toBe('market-square');
    expect(state.knowledge.has('empty-route')).toBe(false);
    const snapshot = await world.engine.load(CAMPAIGN);
    expect(snapshot?.history.some((event) => event.type === 'EvidenceExamined')).toBe(true);
    await consistent(world);
  });
});
