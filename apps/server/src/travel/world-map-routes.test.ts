import type { DmHistoryEntry, WorldMapResponse } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get } from '../testing/ravenford-app.ts';

/**
 * The world map over HTTP and a journey in the DM's history (docs/adr/0057-encounters-maps-loot.md
 * §10): the ADR 0009 order; the DM pins Market Square and the North Gate on Ravenford's map and
 * joins them; Elowen reads both pinned and where she stands; the party walks to the gate and the
 * DM's history tells the journey, undoable as a whole.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

const PARTY = ['elowen-starwhisper', 'brann-ironvale', 'tamsin-quickfoot', 'maren-ashby'];

describe('the world map and a journey', () => {
  it('answers in the ADR 0009 order, and shows the DM and a player the map', async () => {
    const created = await dmTable();
    tables.push(created);
    const { app, command } = created;
    expect((await get(app, `${CAMPAIGN}/world-map?perspective=DM`)).statusCode).toBe(401);
    expect((await get(app, `${CAMPAIGN}/world-map?perspective=DM&x=1`, TOKENS.dm)).statusCode).toBe(
      400,
    );
    const pins = [
      { placeId: 'market-square', x: 0.4, y: 0.5 },
      { placeId: 'north-gate', x: 0.7, y: 0.2 },
    ];
    expect(
      (await command({ type: 'SetMapPins', regionId: 'ravenford', pins }, TOKENS.dm)).status,
    ).toBe(200);
    const route = { miles: 1, terrain: 'urban', road: true };
    const joined = { type: 'SetRoute', fromId: 'market-square', toId: 'north-gate', route };
    expect((await command(joined, TOKENS.dm)).status).toBe(200);
    const read = async (token: string, perspective: string) => {
      const response = await get(app, `${CAMPAIGN}/world-map?perspective=${perspective}`, token);
      expect(response.statusCode).toBe(200);
      return response.json<WorldMapResponse>();
    };
    const mine = await read(TOKENS.player, 'PLAYER');
    expect(mine.regions[0]?.pins.map((pin) => pin.place.entityId)).toEqual([
      'market-square',
      'north-gate',
    ]);
    expect(mine.routes).toMatchObject([{ miles: 1, terrain: 'urban', road: true }]);
    expect(mine.hereId).toBe('market-square');
    expect((await read(TOKENS.dm, 'DM')).party.map((one) => one.entityId).sort()).toEqual(
      [...PARTY].sort(),
    );
  });

  it('lists the journey in the DM’s history beside time and weather', async () => {
    const created = await dmTable();
    tables.push(created);
    const { command, page } = created;
    const route = { miles: 1, terrain: 'urban', road: true };
    await command(
      { type: 'SetRoute', fromId: 'market-square', toId: 'north-gate', route },
      TOKENS.dm,
    );
    const went = await command(
      { type: 'Travel', toId: 'north-gate', pace: 'normal', travellerIds: PARTY },
      TOKENS.dm,
      'to-the-gate',
    );
    expect(went.result.status).toBe('accepted');
    const [journey] = (await page()).entries as [DmHistoryEntry];
    expect(journey).toMatchObject({
      kind: 'world',
      commandId: 'http:dm-ravenford:to-the-gate',
      change: {
        kind: 'travel',
        from: { entityId: 'market-square' },
        to: { entityId: 'north-gate' },
        pace: 'normal',
        hours: 1,
        days: 1,
        failed: 0,
      },
      undo: { possible: true },
    });
  });
});
