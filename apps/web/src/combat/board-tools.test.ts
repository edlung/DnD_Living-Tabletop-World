import { describe, expect, it } from 'vitest';

import { areaOf, templateSquares } from './board-tools.tsx';

/** A spell's area laid on the board (docs/adr/0057-encounters-maps-loot.md §5), the rules' own. */
const field = { width: 16, height: 12, difficult: [], cover: [] };

describe('a laid spell’s area', () => {
  it('covers a 20-ft sphere’s 9 × 9 squares around its point', () => {
    const covered = templateSquares(
      { kind: 'area', spec: { shape: 'sphere', sizeFt: 20, widthFt: 5 }, toward: { x: 8, y: 6 } },
      [],
      field,
    );
    expect(covered?.size).toBe(81);
    expect(covered?.has('4,2')).toBe(true);
    expect(covered?.has('3,6')).toBe(false);
  });

  it('sends a cone from its caster, never over the caster’s own square', () => {
    const covered = templateSquares(
      { kind: 'area', spec: { shape: 'cone', sizeFt: 15, widthFt: 5 }, toward: { x: 4, y: 3 } },
      [{ x: 0, y: 3 }],
      field,
    );
    expect(covered?.has('0,3')).toBe(false);
    expect(covered?.has('1,3')).toBe(true);
    expect(covered?.has('3,3')).toBe(true);
    expect(covered?.has('4,3')).toBe(false);
    // Nothing is laid from no one, nor before its point is pressed.
    expect(templateSquares({ kind: 'area', spec: areaSpec(), toward: null }, [], field)?.size).toBe(
      0,
    );
    expect(areaOf({ shape: 'line', sizeFt: 60, widthFt: 10 })).toEqual({
      shape: 'line',
      sizeFt: 60,
      widthFt: 10,
      origin: 'self',
    });
  });
});

function areaSpec() {
  return { shape: 'sphere' as const, sizeFt: 20, widthFt: 5 };
}
