import type { Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { inSpellArea, type SpellArea } from './areas.ts';

/** Spell areas on the grid (docs/adr/0052-spells-as-data.md §5), drawn as the squares they cover. */
const CASTER: readonly Square[] = [{ x: 5, y: 5 }];

function covered(area: SpellArea, toward: Square | null, caster = CASTER): string[] {
  const out: string[] = [];
  for (let y = 0; y < 12; y += 1)
    for (let x = 0; x < 12; x += 1)
      if (inSpellArea(area, caster, toward, { x, y })) out.push(`${String(x)},${String(y)}`);
  return out;
}

describe('areas from a point', () => {
  it('a sphere covers the squares within its radius, as the grid counts', () => {
    const sphere = covered(
      { shape: 'sphere', sizeFt: 5, widthFt: null, origin: 'point' },
      { x: 2, y: 2 },
    );
    expect(sphere).toHaveLength(9);
    expect(sphere).toContain('1,1');
    expect(sphere).not.toContain('4,2');
  });

  it('a 10-foot cube on its point is two squares a side', () => {
    expect(
      covered({ shape: 'cube', sizeFt: 10, widthFt: null, origin: 'point' }, { x: 3, y: 3 }),
    ).toEqual(['3,3', '4,3', '3,4', '4,4']);
  });
});

describe('areas from the caster', () => {
  it('a 15-foot cone east: one square wide at its start, three at its end', () => {
    const cone = covered(
      { shape: 'cone', sizeFt: 15, widthFt: null, origin: 'self' },
      { x: 8, y: 5 },
    );
    expect(cone).toContain('6,5');
    expect(cone).toContain('8,4');
    expect(cone).toContain('8,6');
    expect(cone).not.toContain('6,4');
    expect(cone).not.toContain('9,5');
    expect(cone).not.toContain('5,5');
  });

  it('a 30-foot line north, 5 feet wide', () => {
    expect(
      covered({ shape: 'line', sizeFt: 30, widthFt: 5, origin: 'self' }, { x: 5, y: 0 }),
    ).toEqual(['5,0', '5,1', '5,2', '5,3', '5,4']);
  });

  it('a 15-foot cube west from the caster’s side', () => {
    const cube = covered(
      { shape: 'cube', sizeFt: 15, widthFt: null, origin: 'self' },
      { x: 0, y: 5 },
    );
    expect(cube).toHaveLength(9);
    expect(cube).toContain('2,4');
    expect(cube).not.toContain('5,5');
  });

  it('a 10-foot emanation around a Large caster, its own space left out', () => {
    const large: Square[] = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    const around = covered(
      { shape: 'emanation', sizeFt: 10, widthFt: null, origin: 'self' },
      null,
      large,
    );
    expect(around).toHaveLength(36 - 4);
    expect(around).not.toContain('5,5');
    expect(around).toContain('3,3');
  });
});
