import { describe, expect, it } from 'vitest';

import { foeSquares, partyStartSquares } from './encounter-layout.ts';

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
});
