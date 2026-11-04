import { describe, expect, it } from 'vitest';

import { cellsOf } from './battle-map-tools.tsx';

/** A battle map's whole cells from its grid's corner (docs/adr/0057-encounters-maps-loot.md §3). */
describe('the cells a battle map holds', () => {
  it('counts whole cells from the first one, never more than forty a side', () => {
    expect(cellsOf({ width: 1200, height: 900 }, { cellPx: 70, originX: 25, originY: 10 })).toEqual(
      { columns: 16, rows: 12 },
    );
    expect(cellsOf({ width: 1536, height: 1536 }, { cellPx: 16, originX: 0, originY: 0 })).toEqual({
      columns: 40,
      rows: 40,
    });
  });
});
