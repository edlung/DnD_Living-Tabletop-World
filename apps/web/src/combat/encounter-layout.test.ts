import { describe, expect, it } from 'vitest';

import {
  foeSquares,
  layoutProblem,
  partyStartSquares,
  resizeGround,
  spaceOf,
  type LaidToken,
} from './encounter-layout.ts';

/**
 * A built encounter's starting squares (docs/adr/0057-encounters-maps-loot.md §1): the party on
 * the left edge every other row, the foes from the right edge leftward by their size, a square
 * apart, never past the field's middle.
 */
describe('the builder’s layout', () => {
  it('puts the party on the left edge, every other row', () => {
    expect(partyStartSquares(4, { width: 16, height: 12 })).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 3 },
      { x: 0, y: 5 },
      { x: 0, y: 7 },
    ]);
  });

  it('lines the foes up from the right edge, a Large one two squares wide', () => {
    expect(foeSquares(['medium', 'medium', 'large'], { width: 16, height: 12 })).toEqual([
      { x: 15, y: 0 },
      { x: 15, y: 2 },
      { x: 14, y: 4 },
    ]);
    // Twelve rows hold six Medium foes a square apart; the seventh starts the next column.
    const seven = foeSquares(
      Array.from({ length: 7 }, () => 'medium' as const),
      {
        width: 16,
        height: 12,
      },
    );
    expect(seven?.slice(5)).toEqual([
      { x: 15, y: 10 },
      { x: 13, y: 0 },
    ]);
  });

  it('says when the foes do not fit the field', () => {
    expect(
      foeSquares(
        Array.from({ length: 30 }, () => 'medium' as const),
        { width: 8, height: 8 },
      ),
    ).toBeNull();
  });

  it('says what keeps the tokens from a fight: off the field, in a wall, or on one square', () => {
    const field = { width: 8, height: 6, walls: [{ x: 4, y: 4 }] };
    const ogre: LaidToken = {
      key: 'b:ogre#0',
      side: 'hostile',
      name: 'Ogre',
      size: 'large',
      position: { x: 3, y: 3 },
    };
    expect(spaceOf(ogre)).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
    expect(layoutProblem([ogre], field)).toBe('wall');
    expect(layoutProblem([{ ...ogre, position: { x: 7, y: 0 } }], field)).toBe('outside');
    const elowen: LaidToken = {
      key: 'party#0',
      side: 'party',
      name: 'Elowen',
      size: 'medium',
      position: { x: 1, y: 1 },
    };
    expect(layoutProblem([{ ...ogre, position: { x: 0, y: 0 } }, elowen], field)).toBe('shared');
    expect(layoutProblem([{ ...ogre, position: { x: 5, y: 0 } }, elowen], field)).toBeNull();
  });

  it('leaves behind the ground beyond a smaller field', () => {
    const ground = resizeGround(
      {
        width: 16,
        height: 12,
        difficult: [
          { x: 2, y: 2 },
          { x: 12, y: 2 },
        ],
        cover: [{ x: 9, y: 9, level: 'half' }],
        walls: [{ x: 1, y: 11 }],
      },
      10,
      10,
    );
    expect(ground).toEqual({
      width: 10,
      height: 10,
      difficult: [{ x: 2, y: 2 }],
      cover: [{ x: 9, y: 9, level: 'half' }],
      walls: [],
    });
  });
});
