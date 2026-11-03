import type { Battlefield } from './battlefield.ts';
import { describe, expect, it } from 'vitest';

import { fogBattlefield, paintBattlefield, sameGround } from './terrain-paint.ts';

/**
 * The DM's brush (docs/adr/0057-encounters-maps-loot.md §2): each paint replaces its own kind on
 * its squares, a wall replaces everything, anything else takes a wall away, a clear leaves the
 * squares bare, and the same ground is always written the same way.
 */
const field: Battlefield = {
  width: 8,
  height: 6,
  difficult: [{ x: 1, y: 1 }],
  cover: [{ x: 2, y: 2, level: 'half' }],
  water: [{ x: 3, y: 3, deep: true }],
  ground: [{ x: 4, y: 4, ft: 10 }],
  obscured: [{ x: 5, y: 5 }],
  ambient: 'dim',
  light: [{ x: 1, y: 1, level: 'bright' }],
};

describe('a stroke of the DM’s brush', () => {
  it('raises a wall over whatever lay there, and keeps the light', () => {
    const walled = paintBattlefield(
      field,
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
        { x: 5, y: 5 },
        { x: 1, y: 1 },
      ],
      { kind: 'wall' },
    );
    expect(walled).toEqual({
      width: 8,
      height: 6,
      difficult: [],
      cover: [],
      walls: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
        { x: 5, y: 5 },
      ],
      ambient: 'dim',
      light: [{ x: 1, y: 1, level: 'bright' }],
    });
  });

  it('lays each kind over its own, takes a wall away, and clears to bare ground', () => {
    const walled = paintBattlefield(field, [{ x: 0, y: 0 }], { kind: 'wall' });
    const watered = paintBattlefield(walled, [{ x: 0, y: 0 }], { kind: 'water', deep: false });
    expect(watered.walls).toBeUndefined();
    expect(watered.water).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 3, deep: true },
    ]);
    const covered = paintBattlefield(field, [{ x: 2, y: 2 }], {
      kind: 'cover',
      level: 'total',
    });
    expect(covered.cover).toEqual([{ x: 2, y: 2, level: 'total' }]);
    const sunk = paintBattlefield(
      field,
      [
        { x: 4, y: 4 },
        { x: 0, y: 1 },
      ],
      { kind: 'ground', ft: -5 },
    );
    expect(sunk.ground).toEqual([
      { x: 0, y: 1, ft: -5 },
      { x: 4, y: 4, ft: -5 },
    ]);
    // Level ground again: no height recorded.
    expect(
      paintBattlefield(field, [{ x: 4, y: 4 }], { kind: 'ground', ft: 0 }).ground,
    ).toBeUndefined();
    const heavy = paintBattlefield(field, [{ x: 5, y: 5 }], { kind: 'obscured', heavy: true });
    expect(heavy.obscured).toEqual([{ x: 5, y: 5, heavy: true }]);
    const bare = paintBattlefield(
      field,
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
        { x: 5, y: 5 },
      ],
      { kind: 'clear' },
    );
    expect(bare).toEqual({
      width: 8,
      height: 6,
      difficult: [],
      cover: [],
      ambient: 'dim',
      light: [{ x: 1, y: 1, level: 'bright' }],
    });
  });

  it('knows ground laid again as the same ground, whatever the order', () => {
    const again = paintBattlefield(field, [{ x: 1, y: 1 }], { kind: 'difficult' });
    expect(sameGround(again, field)).toBe(true);
    const shuffled: Battlefield = { ...field, cover: [{ level: 'half', y: 2, x: 2 }] };
    expect(sameGround(shuffled, field)).toBe(true);
    expect(
      sameGround(paintBattlefield(field, [{ x: 0, y: 0 }], { kind: 'difficult' }), field),
    ).toBe(false);
  });

  it('lays the fog of war on squares and lifts it, leaving the ground as it lay', () => {
    const fogged = fogBattlefield(
      field,
      [
        { x: 3, y: 3 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      true,
    );
    expect(fogged.fog).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(fogged.water).toEqual(field.water);
    const lifted = fogBattlefield(fogged, [{ x: 2, y: 2 }], false);
    expect(lifted.fog).toEqual([{ x: 3, y: 3 }]);
    expect(fogBattlefield(lifted, [{ x: 3, y: 3 }], false).fog).toBeUndefined();
  });
});
