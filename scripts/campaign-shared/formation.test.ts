import { describe, expect, it } from 'vitest';
import type { Layout } from './combat-kit.ts';
import { placeFormation } from './formation.ts';

const layout: Layout = {
  width: 6,
  height: 6,
  difficult: [],
  cover: [],
  partySide: 'W',
  foeSide: 'E',
};

describe('the space reserved for a large foe in a prepared encounter', () => {
  it('keeps other tokens out of all nine squares, including during automatic placement', () => {
    const { heroes, foes } = placeFormation(layout, 4, 3, { boss: { x: 3, y: 1 } }, 'huge');
    expect(foes.at(-1)).toEqual({ x: 3, y: 1 });
    for (const p of [...heroes, ...foes.slice(0, -1)])
      expect(p.x >= 3 && p.y >= 1 && p.y <= 3).toBe(false);
  });

  it('rejects an overlapping party start and a boss extending beyond the map', () => {
    expect(() =>
      placeFormation(
        layout,
        1,
        1,
        {
          party: [{ x: 4, y: 2 }],
          boss: { x: 3, y: 1 },
        },
        'huge',
      ),
    ).toThrow('Invalid authored starting square');
    expect(() => placeFormation(layout, 1, 1, { boss: { x: 5, y: 2 } }, 'large')).toThrow(
      'Invalid authored starting square',
    );
  });
});
