import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { reactionWindowViolations } from './reactions/invariants.ts';
import { forkWorld } from './testing/fork.ts';
import { RETEST_1_HISTORY, historicalWorld, loadHistory } from './testing/history.ts';
import { cast } from './testing/reactions.ts';
import { CAMPAIGN, ELOWEN, SHAMAN, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Randomized commands and undos on a history an earlier revision wrote
 * (fixtures/history; Gate 03 retest 2, G03-H05). The retest 1 stream is
 * continued by the current engine: Elowen casts and moves, the DM authors
 * magic, placements, and statuses, and anything effective may be undone,
 * old commands included. After every step the state is consistent and a
 * rejection changed nothing; every five steps replay and re-decision agree
 * (commands the old writer decided are folded as recorded, ADR 0007); and
 * whatever undo would accept for the latest commands leaves a history that
 * verifies too.
 */
const fixture = await loadHistory(RETEST_1_HISTORY);
const PLACES = ['old-trade-road', 'north-gate', 'market-square'];
const MAGIC_HOLDERS = ['legacy-far-charm', SHAMAN, 'legacy-bystander', 'goblin-raider-1', ELOWEN];
const TARGETS = ['legacy-bystander', SHAMAN, ELOWEN, 'goblin-raider-2', 'mira-holloway'];

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

async function step(world: RoadWorld, rng: () => number): Promise<CommandResult> {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const roll = rng();
  if (roll < 0.35) {
    // The latest (reverse order), one just beneath later commands, or any at all.
    const commands = effective(await world.state());
    const latest = commands[commands.length - 1] ?? '';
    const recent = commands.slice(-5, -1);
    const kind = rng();
    const target =
      kind < 0.45 ? latest : kind < 0.85 && recent.length > 0 ? pick(recent) : pick(commands);
    return world.dm({ type: 'UndoCommand', targetCommandId: target });
  }
  if (roll < 0.6) {
    return world.dm(
      pick([
        {
          type: 'AddClue',
          entityId: pick(MAGIC_HOLDERS),
          method: 'magic',
          statement: `A faint aura (${String(Math.floor(rng() * 1e6))}).`,
          subjects: [],
        },
        { type: 'PlaceEntity', entityId: 'legacy-far-charm', locationId: pick(PLACES) },
        {
          type: 'ChangeEntityStatus',
          entityId: pick(TARGETS),
          status: pick(['dead', 'active']),
        },
      ]),
    );
  }
  return world.submit(
    pick([
      cast(ELOWEN, 'detect-magic'),
      cast(ELOWEN, pick(['hunters-mark', 'healing-word']), { targetId: pick(TARGETS) }),
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

describe('random commands and undos on the retest 1 history', () => {
  it.each([1, 2, 3, 5, 8, 13, 21, 34])('seed %i', async (seed) => {
    const rng = mulberry32(seed * 104_729);
    const world = await historicalWorld(fixture);
    let undone = 0;
    for (let index = 0; index < 40; index += 1) {
      const before = await world.state();
      const result = await step(world, rng);
      const after = await world.state();
      if (result.status === 'rejected') expect(after.version).toBe(before.version);
      else if (
        after.version > before.version &&
        after.commands.get(result.commandId)?.commandType === 'UndoCommand'
      ) {
        undone += 1;
      }
      expect(checkWorldIntegrity(after), `step ${String(index)}`).toEqual([]);
      expect(reactionWindowViolations(after), `step ${String(index)}`).toEqual([]);
      if (index % 5 === 4) await verifyHistory(world);
      if (index % 10 === 9) await expectUndosSafe(world);
    }
    expect(undone).toBeGreaterThan(2);
    await verifyHistory(world);
  });
});
