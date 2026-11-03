import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { assetIdFor } from './records.ts';
import { assetWorld, codeOf } from './testing/world.ts';
import { playerAssetView } from './views.ts';

/**
 * A battle map's grid (docs/adr/0057-encounters-maps-loot.md §3): the DM lines it up — a cell's
 * size and its first full cell's corner in the picture's pixels, its columns and rows — on a
 * standing battle map only. Visual state: the picture's record, shown to players with it, undone
 * as any DM command; never a world fact.
 */
const ROAD = 'old-trade-road';
const MIRA = 'mira-vale';
const battleMap = { variant: 'derived', label: 'map', purpose: 'battle-map' } as const;
const grid = { cellPx: 64, originX: 12, originY: 20, columns: 18, rows: 14 };

describe('a battle map’s grid', () => {
  it('lines up a standing battle map, shows to players with it, and undoes', async () => {
    const world = await assetWorld();
    await world.approved(ROAD, 1);
    const mapRequest = await world.request(ROAD, battleMap);
    await world.start(mapRequest);
    await world.complete(mapRequest, 2);
    const map = assetIdFor(mapRequest);
    const align = (next: typeof grid) =>
      world.as(DM, { type: 'AlignBattleMap', assetId: map, grid: next });
    // A candidate takes a grid already, so the DM sees it lined up before approving.
    const aligned = await align(grid);
    expect(codeOf(aligned)).toBe('accepted');
    await world.approve(map);
    const record = (await world.state()).assets.assets.get(map);
    expect(record?.grid).toEqual(grid);
    expect(record && playerAssetView(record)).toMatchObject({ purpose: 'battle-map', grid });
    // The same grid again changes nothing; a first cell beyond one cell is refused.
    expect(codeOf(await align(grid))).toBe('NO_EFFECT');
    expect(codeOf(await align({ ...grid, originX: 64 }))).toBe('INVALID_ASSET');
    const moved = await align({ ...grid, cellPx: 70, columns: 16 });
    expect(codeOf(moved)).toBe('accepted');
    expect((await world.state()).assets.assets.get(map)?.grid?.cellPx).toBe(70);
    // Undo puts the earlier grid back.
    if (moved.status !== 'accepted') throw new Error('not aligned');
    expect(codeOf(await world.undo(moved.commandId))).toBe('accepted');
    expect((await world.state()).assets.assets.get(map)?.grid).toEqual(grid);
    await world.verified();
  });

  it('is a battle map’s only, and never a retracted one’s', async () => {
    const world = await assetWorld();
    const picture = await world.approved(MIRA, 1);
    expect(codeOf(await world.as(DM, { type: 'AlignBattleMap', assetId: picture, grid }))).toBe(
      'INVALID_ASSET',
    );
    await world.approved(ROAD, 2);
    const map = await world.approved(ROAD, 3, battleMap);
    await world.retract(map);
    expect(codeOf(await world.as(DM, { type: 'AlignBattleMap', assetId: map, grid }))).toBe(
      'INVALID_ASSET',
    );
    // Off the schema: a cell under 8 px, more than 40 columns.
    expect(
      codeOf(
        await world.as(DM, {
          type: 'AlignBattleMap',
          assetId: map,
          grid: { ...grid, cellPx: 4, columns: 41 },
        }),
      ),
    ).toBe('INVALID_COMMAND');
    await world.verified();
  });
});
