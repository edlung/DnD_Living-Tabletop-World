import type { CommandResult } from '@ltw/contracts';
import { replay, undoneBeneathEarlierWriters, type RecordedEvent } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  effectiveAfter,
  eventFromRow,
  historicalWorld,
  loadHistory,
  outsideCastLegal,
  type HistoryFixture,
} from './testing/history.ts';
import { ELOWEN, codeOf, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * G03-H07 (reviews/ASTRA_GATE_03_RETEST_3.md):
 * `current_undo_preserves_old_spell_legality_premises`. Revision 88d8137
 * recorded Elowen's spells outside an unrelated fight without her target's
 * and her own premises; revision b38cbbc recorded the same casts in full (the
 * control). By owner decision (ADR 0006, Gate 03 retest 3 amendment) a command
 * an earlier writer decided depends on everything before it: nothing beneath
 * it can be undone while it stands, so old history comes off only from its
 * end backwards. The current writer's casts keep their exact dependencies
 * (`gate03-h04-regressions.test.ts`).
 */
const WRITERS: [string, HistoryFixture][] = [
  ['88d8137 (retest 1)', await loadHistory('88d8137-outside-casts')],
  ['b38cbbc (retest 2, control)', await loadHistory('b38cbbc-outside-casts')],
];
/** A premise, the cast standing on it, and that cast's target. */
const VARIANTS = [
  ['revival', 'mark-revived', 'h07-revived'],
  ['target-placement', 'mark-placed', 'h07-placed'],
  ['caster-placement', 'mark-innkeeper', 'h07-innkeeper'],
  ['patient-revival', 'heal-patient', 'h07-patient'],
  ['revived', 'mark-revived', 'h07-revived'], // the target's creation (control)
] as const;

const step = (fixture: HistoryFixture, name: string): string => {
  const commandId = fixture.labels[name];
  if (commandId === undefined) throw new Error(`no step ${name}`);
  return commandId;
};
const undo = (world: RoadWorld, commandId: string) =>
  world.dm({ type: 'UndoCommand', targetCommandId: commandId });
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? (result.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId)
    : [];

/** Refused atomically, naming the dependent; then explicit reverse order recovers. */
async function expectProtected(fixture: HistoryFixture, premise: string, dependent: string) {
  const world = await historicalWorld(fixture);
  const before = await world.state();
  const refused = await undo(world, step(fixture, premise));
  expect(codeOf(refused)).toBe('UNDO_UNSAFE');
  expect(blockersOf(refused)).toContain(step(fixture, dependent));
  expect(await world.state()).toEqual(before);
  // A fresh process reads the same canon.
  const reloaded = await roadWorld({ shared: { store: world.store, namespace: 9 } });
  expect(await reloaded.state()).toEqual(before);
  await verifyHistory(world);
  for (const commandId of effectiveAfter(before, step(fixture, premise))) {
    expect(codeOf(await undo(world, commandId)), commandId).toBe('accepted');
  }
  expect(codeOf(await undo(world, step(fixture, premise)))).toBe('accepted');
  await verifyHistory(world);
  return world;
}

describe.each(WRITERS)(
  'G03-H07 current_undo_preserves_old_spell_legality_premises: %s',
  (_, fixture) => {
    it.each(VARIANTS)(
      'undo of %s beneath %s is refused while the cast stands, and reverse order recovers',
      async (premise, cast, targetId) => {
        // Before anything, the original rules accepted the cast where it stands.
        const world = await historicalWorld(fixture);
        expect(await outsideCastLegal(world, step(fixture, cast), ELOWEN, targetId)).toBe(true);
        const refused = await undo(world, step(fixture, premise));
        expect(codeOf(refused)).toBe('UNDO_UNSAFE');
        // ... and still do after the refused undo.
        expect(await outsideCastLegal(world, step(fixture, cast), ELOWEN, targetId)).toBe(true);
        await expectProtected(fixture, premise, cast);
      },
    );
  },
);

const GAPS = await loadHistory('429e2a2-gaps');
const GATE_02 = await loadHistory('017ab0b-investigation');

describe('audit: what other earlier writers recorded incompletely stays protected', () => {
  it.each([
    ['429e2a2: an inspection passing over a clue found before', GAPS, 'find', 'pass-over'],
    [
      '429e2a2: Detect Magic without its sensing premises',
      GAPS,
      'charm-moved',
      'detect-after-move',
    ],
    ['429e2a2: Hunter’s Mark without its target’s premises', GAPS, 'revival', 'mark-revived'],
    ['429e2a2: a missed attack without the target’s vitals', GAPS, 'seren-ac', 'miss'],
    ['429e2a2: a turn passing over the dead', GAPS, 'combatant-dies', 'turn-0'],
    ['017ab0b: an inspection passing over a clue found before', GATE_02, 'find', 'pass-over'],
  ] as const)('%s', async (_, fixture, premise, dependent) => {
    await expectProtected(fixture, premise, dependent);
  });
});

describe('the owner’s rule, not a footprint, protects old history', () => {
  it('a standing old command with no premises still blocks what lies beneath it', async () => {
    // Back to the DM's move of the charm (a placement, nothing more), newest first.
    const world = await historicalWorld(GAPS);
    const moved = step(GAPS, 'charm-moved');
    for (const commandId of effectiveAfter(await world.state(), moved)) {
      expect(codeOf(await undo(world, commandId)), commandId).toBe('accepted');
    }
    // The clue is not what the move read, yet the old move still stands on it.
    const refused = await undo(world, step(GAPS, 'charm-magic'));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual([moved]);
    expect(codeOf(await undo(world, moved))).toBe('accepted');
    expect(codeOf(await undo(world, step(GAPS, 'charm-magic')))).toBe('accepted');
    await verifyHistory(world);
  });
});

describe('the check of undo on history earlier writers decided', () => {
  it('finds an undo that reached beneath a standing old command, and only that', () => {
    const fixture = WRITERS[0]?.[1];
    if (!fixture) throw new Error('no history');
    const events = fixture.events.map(eventFromRow);
    const state = replay(events);
    const last = events[events.length - 1];
    if (!last) throw new Error('empty history');
    const sequence = last.sequence + 1;
    const undone = (targetCommandId: string, schemaVersion: number) =>
      ({
        ...last,
        sequence,
        eventId: '00000000-0000-4000-8000-0000000fffff',
        schemaVersion,
        type: 'CommandUndone',
        payload: { targetCommandId, targetCommandType: 'ChangeEntityStatus', restores: [] },
        causation: {
          commandId: 'synthetic-undo',
          commandType: 'UndoCommand',
          actor: last.causation.actor,
        },
      }) as RecordedEvent;
    // The current writer undoing the revival beneath the old cast that still stands.
    expect(
      undoneBeneathEarlierWriters(state, [...events, undone(step(fixture, 'revival'), 2)]),
    ).toEqual(['synthetic-undo']);
    // An earlier writer's own undo is its own record, decided by its rules.
    expect(
      undoneBeneathEarlierWriters(state, [...events, undone(step(fixture, 'revival'), 1)]),
    ).toEqual([]);
    // The newest old command: nothing stands after it.
    const [newest] = effectiveAfter(state, step(fixture, 'revival'));
    expect(undoneBeneathEarlierWriters(state, [...events, undone(newest ?? '', 2)])).toEqual([]);
  });
});
