import { randomUUID } from 'node:crypto';

import type {
  DmLibraryResponse,
  HandoutsResponse,
  KeptHandoutView,
  RollEntry,
  RollFeedResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DiceSource } from '../dice/table-rolls.ts';
import { InMemoryRestStore, InMemoryTableStore } from '../dice/table-store.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from '../testing/ravenford-app.ts';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4): "The map of the road" kept for later,
 * changed, given to the party and then to Elowen, staying in the library; "Road encounters" on a
 * d6 — wolves, a pedlar, bandits — rolled by the server for the DM alone and for the table. A
 * player reads neither the library nor the DM's hidden roll.
 */
const queue: number[] = [];
const dice: DiceSource = {
  roll: (sides) => {
    const value = queue.shift();
    if (value === undefined || value > sides) throw new Error(`no scripted d${String(sides)}`);
    return value;
  },
};
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const ROAD = {
  name: 'Road encounters',
  die: 6,
  results: [
    { from: 1, to: 2, text: 'Wolves' },
    { from: 3, to: 3, text: 'A pedlar' },
    { from: 4, to: 6, text: 'Bandits' },
  ],
};

beforeEach(async () => {
  let tick = 0;
  queue.length = 0;
  app = await ravenfordApp(
    await seededEngine(),
    testAiGateway(),
    testAuthoring(),
    testAssets().contents,
    testDm(),
    {
      store: new InMemoryTableStore(),
      rests: new InMemoryRestStore(),
      dice,
      now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, (tick += 1))).toISOString(),
    },
  );
});
afterEach(async () => {
  await app.close();
});

/** A write as the DM. */
const dmPost = (url: string, body: unknown) => post(app, url, body, TOKENS.dm);
const library = async (token: string = TOKENS.dm) => get(app, `${BASE}/dm/library`, token);
const kept = async () => (await library()).json<DmLibraryResponse>();
const keep = (entryId: string, body: unknown, token: string = TOKENS.dm) =>
  post(app, `${BASE}/dm/library/handouts/${entryId}`, body, token);
const feed = async (perspective: string, token: string) =>
  (await get(app, `${BASE}/rolls?perspective=${perspective}`, token)).json<RollFeedResponse>()
    .rolls;

describe('handouts kept for later', () => {
  it('are the DM’s to write, change and delete, and nobody else’s to read', async () => {
    const map = randomUUID();
    const written = await keep(map, { title: 'The map of the road', text: 'North.' });
    expect(written.statusCode).toBe(201);
    expect(written.json<{ handout: KeptHandoutView }>().handout).toMatchObject({
      entryId: map,
      title: 'The map of the road',
      givenAt: null,
    });
    expect(
      (await keep(map, { title: 'The map of the road', text: 'North, past the mill.' })).statusCode,
    ).toBe(200);
    expect((await kept()).handouts.map((one) => one.text)).toEqual(['North, past the mill.']);
    // A player's own perspective is refused; nobody's but the DM's reads it.
    expect((await library(TOKENS.player)).statusCode).toBe(403);
    expect((await keep(randomUUID(), { title: 'Mine', text: 'x' }, TOKENS.player)).statusCode).toBe(
      403,
    );
    // Neither a text nor a picture; a picture of nothing in the world.
    expect((await keep(randomUUID(), { title: 'Empty' })).statusCode).toBe(400);
    expect(
      (await keep(randomUUID(), { title: 'No one', entityId: 'nobody-at-all' })).statusCode,
    ).toBe(422);
    expect((await dmPost(`${BASE}/dm/library/handouts/${map}/delete`, {})).statusCode).toBe(204);
    expect((await kept()).handouts).toEqual([]);
    expect((await dmPost(`${BASE}/dm/library/handouts/${map}/delete`, {})).statusCode).toBe(404);
  });

  it('are given as any handout, to the party or one player, and stay', async () => {
    const map = randomUUID();
    await keep(map, { title: 'The map of the road', text: 'North.', entityId: 'mira-vale' });
    const give = (body: unknown) => dmPost(`${BASE}/dm/library/handouts/${map}/give`, body);
    expect((await give({})).statusCode).toBe(201);
    expect((await give({ recipientId: ELOWEN })).statusCode).toBe(201);
    const read = async (perspective: string) =>
      (
        await get(app, `${BASE}/handouts?perspective=${perspective}`, TOKENS.player)
      ).json<HandoutsResponse>().handouts;
    expect((await read('PLAYER')).map((one) => one.to)).toEqual([
      'party',
      { entityId: ELOWEN, name: 'Elowen Starwhisper' },
    ]);
    expect((await read('PARTY')).map((one) => one.picture?.name)).toEqual(['Mira Vale']);
    const [still] = (await kept()).handouts;
    expect(still?.givenAt).not.toBeNull();
    // A picture the party does not know is the DM's to keep, never to give.
    const secret = randomUUID();
    await keep(secret, { title: 'A secret', entityId: 'location-f3b82c8b' });
    expect((await dmPost(`${BASE}/dm/library/handouts/${secret}/give`, {})).statusCode).toBe(422);
    expect((await dmPost(`${BASE}/dm/library/handouts/${randomUUID()}/give`, {})).statusCode).toBe(
      404,
    );
  });
});

describe('random tables', () => {
  const table = (entryId: string, body: unknown, token: string = TOKENS.dm) =>
    post(app, `${BASE}/dm/library/tables/${entryId}`, body, token);
  const roll = (entryId: string, hidden: boolean) =>
    dmPost(`${BASE}/dm/library/tables/${entryId}/roll`, { hidden });

  it('cover their die once, in order', async () => {
    const gap = { ...ROAD, results: [ROAD.results[0], ROAD.results[2]] };
    expect((await table(randomUUID(), gap)).statusCode).toBe(400);
    const short = { ...ROAD, die: 8 };
    expect((await table(randomUUID(), short)).statusCode).toBe(400);
    expect((await table(randomUUID(), ROAD, TOKENS.player)).statusCode).toBe(403);
    const road = randomUUID();
    expect((await table(road, ROAD)).statusCode).toBe(201);
    expect((await table(road, { ...ROAD, name: 'The old road' })).statusCode).toBe(200);
    expect((await kept()).tables.map((one) => one.name)).toEqual(['The old road']);
    // An entry is one kind: a handout never overwrites a table.
    expect((await keep(road, { title: 'A map', text: 'x' })).statusCode).toBe(409);
  });

  it('are rolled by the server, for the DM alone or for the table', async () => {
    const road = randomUUID();
    await table(road, ROAD);
    queue.push(5);
    const hidden = await roll(road, true);
    expect(hidden.statusCode).toBe(201);
    expect(hidden.json<{ roll: RollEntry }>().roll).toMatchObject({
      subject: { kind: 'table', name: 'Road encounters', result: 'Bandits' },
      groups: [{ purpose: 'dice', dice: [{ sides: 6, value: 5 }], modifier: 0, total: 5 }],
      hidden: true,
      roller: null,
    });
    expect(await feed('PLAYER', TOKENS.player)).toEqual([]);
    queue.push(3);
    expect((await roll(road, false)).statusCode).toBe(201);
    const seen = await feed('PLAYER', TOKENS.player);
    expect(seen.map((one) => one.subject)).toEqual([
      { kind: 'table', name: 'Road encounters', result: 'A pedlar' },
    ]);
    expect((await feed('DM', TOKENS.dm)).length).toBe(2);
    expect((await roll(randomUUID(), false)).statusCode).toBe(404);
    expect(queue).toEqual([]);
  });
});
