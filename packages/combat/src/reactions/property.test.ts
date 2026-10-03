import { REACTION_COMMAND_TYPES, type CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, currentCombatant, openReactionWindow, type Actor } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  SEREN,
  SEREN_PLAYER,
  addSeren,
  cast,
  closeWindow,
  counterspell,
  ignore,
  withSeren,
} from '../testing/reactions.ts';
import {
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { verifyHistory } from '../testing/verify.ts';

/**
 * Randomized reaction integrity (docs/adr/0016-reaction-engine.md): casts,
 * answers, closes, illegal commands, and undos of anything, in random order
 * with random dice. After every step the state is consistent, a rejection
 * changed nothing, and nothing but answers, closes, and undos was accepted
 * while a window was open. At the end, replay and re-decision agree.
 */
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

const GOBLINS = [RAIDER_1, RAIDER_2, RAIDER_3, SHAMAN];
const PLAYERS: Readonly<Record<string, Actor>> = { [ELOWEN]: PLAYER, [SEREN]: SEREN_PLAYER };
const ANSWERS: ReadonlySet<string> = new Set([...REACTION_COMMAND_TYPES, 'UndoCommand']);

async function randomStep(
  world: RoadWorld,
  rng: () => number,
  mine: readonly string[],
): Promise<{ type: string; result: CommandResult; undid?: string }> {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(rng() * items.length)];
    if (item === undefined) throw new Error('nothing to pick');
    return item;
  };
  const state = await world.state();
  const window = openReactionWindow(state);
  const current = state.encounter ? currentCombatant(state.encounter)?.entityId : undefined;
  const alive = (id: string) => state.entities.get(id)?.status === 'active';
  const options: { type: string; run: () => Promise<CommandResult> }[] = [];
  const as = (id: string) => PLAYERS[id] ?? DM;

  if (window) {
    for (const { entityId } of window.candidates) {
      options.push(
        {
          type: 'UseReaction',
          run: () => world.submit(counterspell(entityId, window.windowId), as(entityId)),
        },
        {
          type: 'DeclineReaction',
          run: () => world.submit(ignore(entityId, window.windowId), as(entityId)),
        },
      );
    }
    options.push({
      type: 'CloseReactionWindow',
      run: () => world.dm(closeWindow(window.windowId)),
    });
  }
  if (current) {
    options.push({
      type: 'EndTurn',
      run: () => world.submit({ type: 'EndTurn', combatantId: current }, as(current)),
    });
    if (current === SHAMAN) {
      const target = pick([ELOWEN, SEREN]);
      const spell = pick(['ashen-bolt', 'binding-hex']);
      options.push({
        type: 'CastSpell',
        run: () => world.dm(cast(SHAMAN, spell, { targetId: target })),
      });
    } else if (current === ELOWEN || current === SEREN) {
      const target = pick(GOBLINS.filter(alive).concat(SHAMAN));
      options.push(
        {
          type: 'Attack',
          run: () =>
            world.submit(
              { type: 'Attack', combatantId: current, attackId: 'longbow', targetId: target },
              as(current),
            ),
        },
        {
          type: 'CastSpell',
          run: () => world.submit(cast(current, 'hunters-mark', { targetId: target }), as(current)),
        },
      );
    } else {
      const target = pick([ELOWEN, SEREN]);
      options.push({
        type: 'Attack',
        run: () =>
          world.dm({
            type: 'Attack',
            combatantId: current,
            attackId: 'shortbow',
            targetId: target,
          }),
      });
    }
  }
  // Undo: mostly the latest effective command (reverse order), sometimes any of them.
  const latest = mine[mine.length - 1];
  if (latest !== undefined && rng() < 0.3) {
    const target = rng() < 0.7 ? latest : pick(mine);
    const result = await world.dm({ type: 'UndoCommand', targetCommandId: target });
    return { type: 'UndoCommand', result, undid: target };
  }
  const chosen = pick(options);
  return { type: chosen.type, result: await chosen.run() };
}

describe('randomized reaction integrity', () => {
  it.each([1, 7, 42, 1337, 20261004, 90])('seed %i', async (seed) => {
    const rng = mulberry32(seed);
    const world = await roadWorld({ entropy: { next: () => Math.floor(rng() * 2 ** 32) } });
    await addSeren(world);
    await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
    const mine: string[] = []; // effective commands of this test, oldest first
    let windows = 0;
    for (let step = 0; step < 70; step += 1) {
      const before = await world.state();
      const paused = openReactionWindow(before) !== null;
      const { type, result, undid } = await randomStep(world, rng, mine);
      const after = await world.state();
      if (result.status === 'rejected') {
        expect(after.version, `${type} rejected yet changed state`).toBe(before.version);
      } else {
        if (undid !== undefined) mine.splice(mine.indexOf(undid), 1);
        else mine.push(result.commandId);
        if (paused) expect(ANSWERS.has(type), `${type} accepted during a window`).toBe(true);
      }
      expect(checkWorldIntegrity(after), `after ${type} at step ${String(step)}`).toEqual([]);
      windows = Math.max(windows, after.reactionWindows.size);
    }
    expect(windows).toBeGreaterThan(0);
    await verifyHistory(world);
  });
});
