import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, replay, writtenEarlier } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  eventFromRow,
  historicalWorld,
  loadHistory,
  type HistoryFixture,
} from './testing/history.ts';
import { codeOf, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Stage 130 (docs/adr/0020-npc-intelligence.md; kernel rules in
 * `packages/domain/src/kernel/AGENTS.md`). The Stage 120 writer (revision
 * b7a1a92, fixtures/history/b7a1a92-npc-memories.json) recorded play memories
 * whose summaries quote names it did not record, and an answer that passed over
 * a record told before without recording it. Its `MemoryRecorded` and
 * `ContradictionDetected` events carry version 2, now earlier: the current
 * reader loads and replays them, continues the campaign with complete records,
 * and refuses any undo beneath the commands those writers decided.
 */
const fixture: HistoryFixture = await loadHistory('b7a1a92-npc-memories');
const label = (name: string) => {
  const commandId = fixture.labels[name];
  if (commandId === undefined) throw new Error(`no step ${name}`);
  return commandId;
};
const undo = (world: RoadWorld, commandId: string) =>
  world.dm({ type: 'UndoCommand', targetCommandId: commandId });
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string }[]).map((b) => b.commandId)
    : [];

describe('the Stage 120 writer’s memories under the Stage 130 reader', () => {
  it('parses and replays every prefix; its memories and contradiction were written earlier', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    const quoted = events.filter(
      (event) =>
        (event.type === 'MemoryRecorded' || event.type === 'ContradictionDetected') &&
        event.causation.commandId.startsWith('http:'),
    );
    expect(quoted.map((event) => event.causation.commandId)).toEqual([
      label('ask-road'),
      label('ask-caravan'),
      label('inspect-weapon'),
      label('ask-thorne'),
      label('ask-thorne'),
    ]);
    expect(quoted.every(writtenEarlier)).toBe(true);
    for (const row of fixture.commands) {
      expect(checkWorldIntegrity(replay(events.slice(0, row.last_sequence)))).toEqual([]);
    }
  });

  it('refuses every undo beneath the commands whose records quote names or pass records over', async () => {
    const world = await historicalWorld(fixture);
    // The later answer passed over the cargo account this one told; nothing recorded that.
    const told = await undo(world, label('ask-road'));
    expect(codeOf(told)).toBe('UNDO_UNSAFE');
    expect(blockersOf(told)).toContain(label('ask-caravan'));
    // Names the memories and the contradiction quote.
    for (const step of ['rename-caravan', 'rename-weapon', 'mira-wagons-willing']) {
      expect(codeOf(await undo(world, label(step))), step).toBe('UNDO_UNSAFE');
    }
    await verifyHistory(world);
  });

  it('continues the campaign with complete records', async () => {
    const world = await historicalWorld(fixture);
    expect(
      codeOf(
        await world.dm({ type: 'SetRelationship', npcId: 'captain-thorne', attitude: 'TRUSTED' }),
      ),
    ).toBe('accepted');
    const asked = await world.submit({
      type: 'AskAbout',
      characterId: 'elowen-starwhisper',
      npcId: 'captain-thorne',
      topicId: 'old-trade-road',
    });
    expect(asked.status === 'accepted' ? asked.outcome : null).toMatchObject({
      kind: 'AskAbout',
      shared: [expect.any(String)],
    });
    const stream = (await world.store.loadStream('ravenford'))?.events ?? [];
    const memory = stream.find(
      (event) => event.type === 'MemoryRecorded' && event.causation.commandId === asked.commandId,
    );
    expect(memory && !writtenEarlier(memory)).toBe(true);
    expect(memory?.payload).toMatchObject({
      named: ['captain-thorne', 'elowen-starwhisper', 'old-trade-road'],
    });
    // The answer rested on Thorne's trust: undoing it is refused, and nothing else changed.
    const trust = stream.find((event) => event.type === 'RelationshipChanged')?.causation.commandId;
    expect(codeOf(await undo(world, trust ?? ''))).toBe('UNDO_UNSAFE');
    await verifyHistory(world);
  });
});
