import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, PLAYER, RAIDER_1, codeOf, roadWorld, startAmbush } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The DM paints the running fight's ground on the Old Trade Road (docs/adr/0057-encounters-maps-
 * loot.md §2): Elowen at (2, 6), Raider 1 at (8, 4). The ground painted is the ground the rules
 * read next: a wall stops a move.
 */
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('the DM paints the battlefield', () => {
  it('raises a wall on free squares, and the rules walk around it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const paint = (squares: { x: number; y: number }[], kind: 'wall' | 'clear' = 'wall') =>
      world.dm({ type: 'PaintTerrain', squares, paint: { kind } });
    const wall = [
      { x: 3, y: 5 },
      { x: 3, y: 6 },
      { x: 3, y: 7 },
    ];
    expect(codeOf(await paint(wall))).toBe('accepted');
    expect((await world.encounter()).battlefield.walls).toEqual(wall);
    // Elowen's step east goes into the wall now.
    const step = await world.submit(
      { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 3, y: 6 }] },
      PLAYER,
    );
    expect(codeOf(step)).not.toBe('accepted');
    // The same wall again changes nothing; none rises where someone stands, nor off the field.
    expect(codeOf(await paint(wall))).toBe('NO_EFFECT');
    const raider = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    if (!raider) throw new Error('no raider');
    expect(reasonOf(await paint([raider.position]))).toBe(
      'A wall cannot rise where someone stands',
    );
    expect(reasonOf(await paint([{ x: 45, y: 2 }]))).toBe('The command failed validation');
    expect(reasonOf(await paint([{ x: 15, y: 13 }]))).toBe('A square lies outside the battlefield');
    // A player holds no brush.
    const player = await world.submit(
      { type: 'PaintTerrain', squares: [{ x: 0, y: 0 }], paint: { kind: 'difficult' } },
      PLAYER,
    );
    expect(codeOf(player)).toBe('FORBIDDEN');
    // Cleared, the road is open again.
    expect(codeOf(await paint(wall, 'clear'))).toBe('accepted');
    expect((await world.encounter()).battlefield.walls).toBeUndefined();
    await verifyHistory(world);
  });
});
