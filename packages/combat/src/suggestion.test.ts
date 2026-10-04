import { openReactionWindow } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { suggestMonsterTurn } from './suggestion.ts';
import { closeWindow } from './testing/reactions.ts';
import {
  ELOWEN,
  RAIDER_1,
  SHAMAN,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * Monster suggestions for the DM (docs/adr/0020-npc-intelligence.md §5): one
 * legal action by the fixed tactic, spell, then attack, then move, then end
 * the turn. Every suggestion is a command the World Engine accepts as is.
 */
async function suggest(world: RoadWorld) {
  return suggestMonsterTurn(await world.state());
}

/** Ends Elowen's opening turn: the Shaman acts next (default initiative). */
async function shamansTurn(): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world);
  expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }))).toBe('accepted');
  return world;
}

describe('suggestMonsterTurn', () => {
  it('suggests nothing outside combat or on a character’s turn', async () => {
    const world = await roadWorld();
    expect(await suggest(world)).toBeNull();
    await startAmbush(world);
    expect(await suggest(world)).toBeNull();
  });

  it('has the Shaman cast at the nearest hostile it may target', async () => {
    const world = await shamansTurn();
    const suggestion = await suggest(world);

    expect(suggestion).toEqual({
      combatantId: SHAMAN,
      tactic: 'spell',
      command: { type: 'CastSpell', combatantId: SHAMAN, spellId: 'ashen-bolt', targetId: ELOWEN },
      explanation:
        'Goblin Shaman casts Ashen Bolt at Elowen Starwhisper, the nearest hostile it may target (50 ft).',
    });
    // Elowen may counter it: the cast waits in a reaction window, as any cast would.
    expect(codeOf(await world.dm(suggestion?.command ?? {}))).toBe('accepted');
  });

  it('then has it move toward the nearest hostile, then end its turn', async () => {
    const world = await shamansTurn();
    await world.dm((await suggest(world))?.command ?? {});
    const window = openReactionWindow(await world.state());
    await world.dm(closeWindow(window?.windowId ?? ''));

    const move = await suggest(world);
    expect(move).toMatchObject({ tactic: 'move', command: { type: 'MoveCombatant' } });
    expect(codeOf(await world.dm(move?.command ?? {}))).toBe('accepted');
    expect(await suggest(world)).toEqual({
      combatantId: SHAMAN,
      tactic: 'end-turn',
      command: { type: 'EndTurn', combatantId: SHAMAN },
      explanation: 'Goblin Shaman ends its turn: nothing it may do reaches a hostile.',
    });
  });

  it('has a Raider attack with its first legal attack', async () => {
    const world = await roadWorld();
    await startAmbush(world, [1, 17, 3, 2, 15]);
    const suggestion = await suggest(world);

    expect(suggestion).toMatchObject({
      combatantId: RAIDER_1,
      tactic: 'attack',
      command: { type: 'Attack', combatantId: RAIDER_1, attackId: 'shortbow', targetId: ELOWEN },
    });
    expect(codeOf(await world.dm(suggestion?.command ?? {}))).toBe('accepted');
  });

  it('suggests only commands the World Engine accepts, through a whole fight', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const tactics = new Set<string>();
    for (let step = 0; step < 80; step += 1) {
      const state = await world.state();
      if (!state.encounter) break;
      const window = openReactionWindow(state);
      if (window) {
        expect(codeOf(await world.dm(closeWindow(window.windowId)))).toBe('accepted');
        continue;
      }
      const suggestion = suggestMonsterTurn(state);
      if (!suggestion) {
        expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: ELOWEN }))).toBe('accepted');
        continue;
      }
      expect(suggestMonsterTurn(state), 'deterministic').toEqual(suggestion);
      const result = await world.dm(suggestion.command);
      expect(codeOf(result), `${String(step)}: ${suggestion.explanation}`).toBe('accepted');
      tactics.add(suggestion.tactic);
    }
    expect(tactics).toEqual(new Set(['spell', 'attack', 'move', 'end-turn']));
  });
});
