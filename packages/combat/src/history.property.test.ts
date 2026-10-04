import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { reactionWindowViolations } from './reactions/invariants.ts';
import { forkWorld } from './testing/fork.ts';
import { historicalWorld, loadHistory, type HistoryFixture } from './testing/history.ts';
import { cast } from './testing/reactions.ts';
import { CAMPAIGN, ELOWEN, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Randomized commands and undos on histories earlier revisions wrote
 * (fixtures/history; Gate 03 retests 2 and 3, G03-H05 and G03-H07). Each
 * stream is continued by the current engine: Elowen casts and moves, the DM
 * authors magic, placements, and statuses, and anything effective may be
 * undone, old commands included. After every step the state is consistent
 * and a rejection changed nothing. Every five steps replay and re-decision
 * agree (commands an earlier writer decided are folded as recorded, ADR 0007),
 * and no undo reached beneath a standing command an earlier writer decided
 * (ADR 0006). Whatever undo would accept for the latest commands leaves a
 * history that verifies too.
 */
const HISTORIES: readonly HistoryFixture[] = await Promise.all(
  [
    '88d8137-gate03-retest1',
    '88d8137-outside-casts',
    'b38cbbc-outside-casts',
    '429e2a2-gaps',
    '017ab0b-investigation',
  ].map(loadHistory),
);
const PLACES = ['old-trade-road', 'north-gate', 'market-square', 'abandoned-caravan-site'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Commands still effective, oldest first, from the old writer's scenario on. */
function effective(state: WorldState): string[] {
  return [...state.commands.values()]
    .filter((c) => c.commandType !== 'UndoCommand' && c.undoneBy === null)
    .filter((c) => !c.commandId.startsWith(`${CAMPAIGN}.`))
    .map((c) => c.commandId);
}

/** Creatures and things of this history: whatever is not a location or a faction. */
function things(state: WorldState): string[] {
  return [...state.entities.values()]
    .filter((e) => e.kind !== 'location' && e.kind !== 'faction')
    .map((e) => e.entityId);
}

async function step(world: RoadWorld, rng: () => number): Promise<CommandResult> {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const state = await world.state();
  const roll = rng();
  if (roll < 0.35) {
    // The latest (reverse order), one just beneath later commands, or any at all.
    const commands = effective(state);
    const latest = commands[commands.length - 1] ?? '';
    const recent = commands.slice(-5, -1);
    const kind = rng();
    const target =
      kind < 0.45 ? latest : kind < 0.85 && recent.length > 0 ? pick(recent) : pick(commands);
    return world.dm({ type: 'UndoCommand', targetCommandId: target });
  }
  const present = things(state);
  if (roll < 0.6) {
    return world.dm(
      pick([
        {
          type: 'AddClue',
          entityId: pick(present),
          method: 'magic',
          statement: `A faint aura (${String(Math.floor(rng() * 1e6))}).`,
          subjects: [],
        },
        { type: 'PlaceEntity', entityId: pick(present), locationId: pick(PLACES) },
        { type: 'ChangeEntityStatus', entityId: pick(present), status: pick(['dead', 'active']) },
      ]),
    );
  }
  return world.submit(
    pick([
      cast(ELOWEN, 'detect-magic'),
      cast(ELOWEN, pick(['hunters-mark', 'healing-word']), { targetId: pick(present) }),
      { type: 'EnterLocation', characterId: ELOWEN, locationId: pick(PLACES) },
    ]),
  );
}

async function expectUndosSafe(world: RoadWorld) {
  for (const target of effective(await world.state()).slice(-4)) {
    const copy = await forkWorld(world, 97);
    const undone = await copy.dm({ type: 'UndoCommand', targetCommandId: target });
    if (undone.status === 'accepted') await verifyHistory(copy);
  }
}

const cases = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map(
  (seed, index) => [seed, HISTORIES[index % HISTORIES.length]] as const,
);

describe('random commands and undos on histories earlier revisions wrote', () => {
  it.each(cases)('seed %i', async (seed, fixture) => {
    if (!fixture) throw new Error('no history');
    const rng = mulberry32(seed * 104_729);
    const world = await historicalWorld(fixture);
    let undone = 0;
    for (let index = 0; index < 40; index += 1) {
      const before = await world.state();
      const result = await step(world, rng);
      const after = await world.state();
      if (result.status === 'rejected') expect(after.version).toBe(before.version);
      else if (after.commands.get(result.commandId)?.commandType === 'UndoCommand') undone += 1;
      expect(checkWorldIntegrity(after), `step ${String(index)}`).toEqual([]);
      expect(reactionWindowViolations(after), `step ${String(index)}`).toEqual([]);
      if (index % 5 === 4) await verifyHistory(world);
      if (index % 10 === 9) await expectUndosSafe(world);
    }
    expect(undone).toBeGreaterThan(2);
    await verifyHistory(world);
  });
});
