import { describe, expect, it } from 'vitest';

import { SequentialIds, SteppingClock } from './engine/deterministic-sources.ts';
import { WorldEngine } from './engine/world-engine.ts';
import { parseRecordedEvent, type RecordedEvent } from './events.ts';
import { CorruptHistoryError, replay } from './evolve.ts';
import { checkWorldIntegrity } from './projections/integrity.ts';
import type { WorldState } from './state.ts';
import { CAMPAIGN, createHarness, seedBasicWorld } from './testing/kernel-harness.ts';
import { mulberry32, randomCommand } from './testing/random-commands.ts';

describe('deterministic replay over randomized command sequences', () => {
  it.each([1, 7, 42, 1337, 20261003])('seed %i', async (seed) => {
    const rng = mulberry32(seed);
    const harness = createHarness();
    await seedBasicWorld(harness);
    const accepted: string[] = [];
    const snapshots = new Map<number, WorldState>();
    const outcomes = { accepted: 0, rejected: 0, undone: 0 };

    for (let step = 0; step < 250; step += 1) {
      const before = await harness.state();
      const commandId = `r${seed}-${step}`;
      const command = randomCommand(rng, before, accepted, step);
      const result = await harness.submit(command, { commandId });
      const after = await harness.state();

      if (result.status === 'rejected') {
        outcomes.rejected += 1;
        expect(after).toEqual(before);
        continue;
      }
      outcomes.accepted += 1;
      if (command['type'] === 'UndoCommand') outcomes.undone += 1;
      accepted.push(commandId);
      expect(checkWorldIntegrity(after), JSON.stringify(command)).toEqual([]);
      snapshots.set(after.version, after);
    }

    // The generator must exercise acceptance, rejection, and undo paths.
    expect(outcomes.accepted).toBeGreaterThan(40);
    expect(outcomes.rejected).toBeGreaterThan(40);
    expect(outcomes.undone).toBeGreaterThan(3);

    const { state, history } = await harness.snapshot();
    expect(replay(history)).toEqual(state);
    for (const [version, snapshot] of snapshots) {
      expect(replay(history, { untilSequence: version })).toEqual(snapshot);
    }

    const serialized = JSON.parse(JSON.stringify(history)) as unknown[];
    expect(replay(serialized.map(parseRecordedEvent))).toEqual(state);

    const fresh = new WorldEngine({
      store: harness.store,
      ids: new SequentialIds(9),
      clock: new SteppingClock(),
    });
    expect((await fresh.load(CAMPAIGN))?.state).toEqual(state);

    const effective = history.filter(
      (event) =>
        event.type !== 'CommandUndone' &&
        state.commands.get(event.causation.commandId)?.undoneBy === null,
    );
    effective.slice(1).forEach((event, index) => {
      expect(event.worldTime).toBeGreaterThanOrEqual(effective[index]?.worldTime ?? -Infinity);
    });
  });
});

describe('corrupt history is detected, never folded', () => {
  const validHistory = async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    return structuredClone(await harness.history()) as RecordedEvent[];
  };
  const mutate = (
    events: RecordedEvent[],
    index: number,
    change: (event: Record<string, unknown>) => void,
  ) => {
    const copy = structuredClone(events);
    change(copy[index] as unknown as Record<string, unknown>);
    return copy;
  };

  it('rejects gaps, foreign events, missing roots, ID reuse, and split commands', async () => {
    const history = await validHistory();

    expect(() => replay([...history.slice(0, 2), ...history.slice(3)])).toThrow(
      CorruptHistoryError,
    );
    expect(() => replay(mutate(history, 2, (e) => (e['campaignId'] = 'other')))).toThrow(
      CorruptHistoryError,
    );
    expect(() => replay(history.slice(1).map((e, i) => ({ ...e, sequence: i + 1 })))).toThrow(
      CorruptHistoryError,
    );
    expect(() =>
      replay(
        mutate(history, 2, (e) => {
          (e['payload'] as Record<string, unknown>)['entityId'] = 'town';
        }),
      ),
    ).toThrow(CorruptHistoryError);
    expect(() =>
      replay(
        mutate(history, 3, (e) => {
          e['causation'] = { ...(history[1]?.causation ?? {}) };
        }),
      ),
    ).toThrow(CorruptHistoryError);
  });

  it('rejects stored rows that do not match the event schema', async () => {
    const [first] = await validHistory();
    const raw = first as unknown as Record<string, unknown>;

    expect(parseRecordedEvent(structuredClone(raw))).toEqual(first);
    for (const broken of [
      { ...raw, sequence: 0 },
      { ...raw, eventId: 'not-a-uuid' },
      { ...raw, schemaVersion: 2 },
      { ...raw, recordedAt: 'yesterday' },
      { ...raw, extra: true },
      { ...raw, payload: { ...(raw['payload'] as object), secret: 'x' } },
      { ...raw, type: 'OrinDied' },
    ]) {
      expect(() => parseRecordedEvent(broken)).toThrow();
    }
    expect(() => parseRecordedEvent(null)).toThrow(TypeError);
  });
});
