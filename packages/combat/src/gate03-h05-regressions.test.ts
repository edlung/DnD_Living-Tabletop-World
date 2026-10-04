import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, replay, type RecordedEvent } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { reactionWindowViolations } from './reactions/invariants.ts';
import {
  RETEST_1_HISTORY,
  eventFromRow,
  historicalWorld,
  loadHistory,
  type HistoryFixture,
} from './testing/history.ts';
import { cast } from './testing/reactions.ts';
import { ELOWEN, codeOf, recorded, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * G03-H05 (reviews/ASTRA_GATE_03_RETEST_2.md):
 * `retest1_placement_premise_survives_current_reader`. A stream the retest 1
 * writer (revision 88d8137) stored through its own HTTP app and PostgreSQL
 * store (fixtures/history) holds version 1 `PremisesRecorded` events with
 * Detect Magic's `placement` premise. The current reader must load it, replay
 * every prefix, serve and continue it, and keep undo safe beneath its casts.
 */
const fixture: HistoryFixture = await loadHistory(RETEST_1_HISTORY);
const label = (name: string) => {
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
const accepted = async (sent: Promise<CommandResult>) => {
  const result = await sent;
  expect(result.status, JSON.stringify(result)).toBe('accepted');
  return result;
};
const premisesOf = (events: readonly RecordedEvent[]) =>
  events.flatMap((event) => (event.type === 'PremisesRecorded' ? [event] : []));

describe('G03-H05 retest1_placement_premise_survives_current_reader', () => {
  it('every stored row parses, and every prefix replays to a consistent state', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    const legacy = premisesOf(events).filter((event) =>
      event.payload.premises.some((premise) => premise.kind === 'placement'),
    );
    expect(legacy.map((event) => event.causation.commandId)).toEqual([
      label('detect'),
      label('detect-again'),
      label('detect-in-combat'),
    ]);
    expect(legacy.every((event) => event.schemaVersion === 1)).toBe(true);
    // As-of reconstruction at every command the old writer recorded.
    for (const row of fixture.commands) {
      const state = replay(events.slice(0, row.last_sequence));
      expect(checkWorldIntegrity(state), row.command_id).toEqual([]);
      expect(reactionWindowViolations(state), row.command_id).toEqual([]);
    }
    const state = replay(events);
    expect(state.commands.get(label('detect-again'))?.undoneBy).toBe(label('undo-detect-again'));
    expect(state.commands.get(label('detect'))?.undoneBy).toBeNull();
  });

  it('the current engine loads the stream and continues it as the current writer', async () => {
    const world = await historicalWorld(fixture);
    expect((await world.state()).version).toBe(fixture.stream.version);
    await accepted(
      world.dm({
        type: 'AddKnowledge',
        scope: { kind: 'PUBLIC' },
        knowledgeType: 'FACT',
        statement: 'The road is quiet again.',
        subjects: ['old-trade-road'],
        knownSince: null,
      }),
    );
    const detect = await accepted(world.submit(cast(ELOWEN, 'detect-magic')));
    const [written] = premisesOf(await recorded(world, detect));
    expect(written?.schemaVersion).toBe(2);
    expect(written?.payload.premises).toContainEqual({
      kind: 'unreached',
      clueId: 'legacy-far-magic',
      entityId: 'legacy-far-charm',
    });
    expect(written?.payload.premises.some((premise) => premise.kind === 'placement')).toBe(false);
    await verifyHistory(world);
  });

  it('undo honours what the old casts relied on, and stays atomic', async () => {
    const world = await historicalWorld(fixture);
    const version = (await world.state()).version;
    for (const premise of [label('far-charm'), label('far-magic')]) {
      const refused = await undo(world, premise);
      expect(codeOf(refused)).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toEqual(
        expect.arrayContaining([label('detect'), label('detect-in-combat')]),
      );
    }
    expect((await world.state()).version).toBe(version);
    await verifyHistory(world);
  });

  it('undo cannot remove a creature an old record names, whatever its premises', async () => {
    // Revision 88d8137 recorded Elowen's Hunter's Mark from outside a fight without
    // her target's premises (the G03-H04 era); the SpellCast record still names it.
    const world = await historicalWorld(fixture);
    const version = (await world.state()).version;
    const refused = await undo(world, label('bystander'));
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toContain(label('mark-bystander'));
    expect((await world.state()).version).toBe(version);
    await verifyHistory(world);
  });

  it('everything the old writer added after the seed comes off in reverse order', async () => {
    const world = await historicalWorld(fixture);
    const state = await world.state();
    const scenario = fixture.commands
      .map((row) => row.command_id)
      .filter((id) => id.startsWith('http:'))
      .filter((id) => {
        const command = state.commands.get(id);
        return command?.commandType !== 'UndoCommand' && command?.undoneBy === null;
      })
      .reverse();
    for (const commandId of scenario) {
      expect(codeOf(await undo(world, commandId)), commandId).toBe('accepted');
    }
    const after = await world.state();
    expect(after.entities.has('legacy-far-charm')).toBe(false);
    expect(after.encounter).toBeNull();
    await verifyHistory(world);
  });

  it('a fresh-current control: the same casts written now protect the same facts', async () => {
    const world = await roadWorld();
    const charm = await accepted(
      world.dm({
        type: 'CreateEntity',
        entityId: 'legacy-far-charm',
        kind: 'item',
        name: 'Far Charm',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      }),
    );
    const clue = await accepted(
      world.dm({
        type: 'AddClue',
        entityId: 'legacy-far-charm',
        clueId: 'legacy-far-magic',
        method: 'magic',
        statement: 'A charm hums far away.',
        subjects: [],
      }),
    );
    const detect = await accepted(world.submit(cast(ELOWEN, 'detect-magic')));
    const [written] = premisesOf(await recorded(world, detect));
    expect(written?.schemaVersion).toBe(2);
    for (const [premise, blockers] of [
      [charm, [clue.commandId, detect.commandId]],
      [clue, [detect.commandId]],
    ] as const) {
      const refused = await undo(world, premise.commandId ?? '');
      expect(codeOf(refused)).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toEqual(blockers);
    }
    await verifyHistory(world);
  });
});
