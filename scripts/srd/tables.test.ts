import { describe, expect, it } from 'vitest';

import { grouped, priceCp, tableUnder, weightLb } from './tables.ts';
import type { PdfLine } from './text.ts';

/** The SRD's tables as the import reads them (docs/adr/0054-items-as-data.md §1). */
const cell = (
  x0: number,
  y0: number,
  text: string,
  x1: number,
  font = 'GillSans',
  size = 9.5,
): PdfLine => ({
  page: 91,
  x0,
  y0,
  x1,
  y1: y0 + size,
  size,
  runs: [{ font, size, text }],
  text,
});

describe('prices and weights', () => {
  it('reads a price in copper pieces', () => {
    expect(priceCp('1,500 GP')).toBe(150_000);
    expect(priceCp('5 CP')).toBe(5);
    expect(priceCp('2 SP')).toBe(20);
    expect(priceCp('1 EP')).toBe(50);
    expect(priceCp('10 PP')).toBe(10_000);
    expect(priceCp('Varies')).toBeNull();
    expect(() => priceCp('free')).toThrow();
  });

  it('reads a weight in pounds, fractions too', () => {
    expect(weightLb('1/4 lb.')).toBe(0.25);
    expect(weightLb('58½ lb.')).toBe(58.5);
    expect(weightLb('1,320 lb.')).toBe(1320);
    expect(weightLb('5 lb. (full)')).toBe(5);
    expect(weightLb('—')).toBeNull();
    expect(() => weightLb('heavy')).toThrow();
  });
});

describe('a table', () => {
  it('joins a row’s pieces left to right and stops where the table ends', () => {
    const lines = [
      cell(54, 734, 'Name Damage Properties Mastery Weight Cost', 549),
      cell(53, 719, 'Simple Melee Weapons', 140, 'GillSans-Italic'),
      cell(430, 689, 'Topple 4 lb. 2 SP', 549),
      cell(61, 689, 'Quarterstaff 1d6 Bludgeoning Versatile (1d8)', 272),
      cell(61, 704, 'Mace 1d6 Bludgeoning — Sap 4 lb. 5 GP', 549),
      // The body text far below is no row.
      cell(61, 300, 'Some later words', 280, 'Helvetica', 10),
      cell(61, 200, 'Far below 1 lb. 1 GP', 549),
    ];
    const rows = tableUnder(lines, /^Name Damage/);
    expect(rows.map((row) => row.text)).toEqual([
      'Simple Melee Weapons',
      'Mace 1d6 Bludgeoning — Sap 4 lb. 5 GP',
      'Quarterstaff 1d6 Bludgeoning Versatile (1d8) Topple 4 lb. 2 SP',
    ]);
    expect(rows[0]?.italic).toBe(true);
    expect(rows[1]?.italic).toBe(false);
  });

  it('groups indented rows under the row that names them, across tables', () => {
    const first = tableUnder(
      [
        cell(318, 175, 'Item Cost', 420),
        cell(317, 161, 'Ale (mug) 4 CP', 420),
        cell(317, 146, 'Inn Stay per Day', 378),
        cell(325, 131, 'Squalid 7 CP', 420),
      ],
      /^Item Cost$/,
    );
    const second = tableUnder(
      [
        cell(434, 175, 'Item Cost', 536),
        cell(441, 161, 'Comfortable 8 SP', 537),
        cell(433, 146, 'Wine (bottle)', 480),
        cell(441, 131, 'Common 2 SP', 537),
      ],
      /^Item Cost$/,
    );
    expect(grouped([...first, ...second]).map(({ row, group }) => [row.text, group])).toEqual([
      ['Ale (mug) 4 CP', null],
      ['Squalid 7 CP', 'Inn Stay per Day'],
      ['Comfortable 8 SP', 'Inn Stay per Day'],
      ['Common 2 SP', 'Wine (bottle)'],
    ]);
  });
});
