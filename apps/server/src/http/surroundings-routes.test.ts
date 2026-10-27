import type { CommandResult, EntityContextResponse, SurroundingsResponse } from '@ltw/contracts';
import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

const BASE = '/campaigns/ravenford';
const HERO = 'elowen-starwhisper';
const URL = `${BASE}/surroundings`;
let app: FastifyInstance;
let store: InMemoryEventStore;

beforeEach(async () => {
  store = new InMemoryEventStore();
  app = await ravenfordApp(await seededEngine(store));
});
afterEach(async () => {
  await app.close();
});

describe('current surroundings over HTTP', () => {
  it('returns current scoped location and preserves restricted DM preview and response hygiene', async () => {
    const player = await get(app, `${URL}?perspective=PLAYER`, TOKENS.player);
    expect(player.statusCode).toBe(200);
    expect(player.headers['cache-control']).toBe('no-store');
    expect(player.headers['vary']).toBe('Authorization');
    expect(player.json<SurroundingsResponse>()).toMatchObject({
      perspective: `CHARACTER:${HERO}`,
      actingCharacterId: HERO,
      location: { entityId: 'market-square', name: 'Market Square' },
    });
    const preview = await get(app, `${URL}?perspective=CHARACTER:${HERO}`, TOKENS.dm);
    expect(preview.json()).toEqual(player.json());
    expect(ALL_SECRET_MARKERS.filter((marker) => player.body.includes(marker))).toEqual([]);
  });

  it('discovers the unknown caravan site from the road and serves current placement after an app restart', async () => {
    const enter = async (locationId: string, commandId: string) => {
      const response = await post(
        app,
        `${BASE}/commands`,
        { commandId, command: { type: 'EnterLocation', characterId: HERO, locationId } },
        TOKENS.player,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json<CommandResult>().status).toBe('accepted');
    };
    await enter('old-trade-road', 'surroundings-road');
    const road = await get(app, `${URL}?perspective=PLAYER`, TOKENS.player);
    expect(road.json<SurroundingsResponse>().nearby).toEqual([
      { entityId: 'location-f3b82c8b', kind: 'location', name: null },
    ]);
    expect(road.body).not.toContain('Abandoned Caravan Site');
    const selected = await get(
      app,
      `${BASE}/entities/location-f3b82c8b/context?perspective=PLAYER`,
      TOKENS.player,
    );
    expect(selected.statusCode).toBe(200);
    expect(selected.json<EntityContextResponse>().context.actions).toContainEqual(
      expect.objectContaining({ id: 'enter_location', legal: true }),
    );
    await enter('location-f3b82c8b', 'surroundings-site');
    const before = await get(app, `${URL}?perspective=PLAYER`, TOKENS.player);
    expect(before.json<SurroundingsResponse>().location).toEqual({
      entityId: 'location-f3b82c8b',
      kind: 'location',
      name: null,
    });
    await app.close();
    app = await ravenfordApp(
      new WorldEngine({ store, ids: new SequentialIds(0xde), clock: new SteppingClock() }),
    );
    const reloaded = await get(app, `${URL}?perspective=PLAYER`, TOKENS.player);
    expect(reloaded.json()).toEqual(before.json());
  });

  it('rejects missing, malformed, duplicated, and extra query inputs without fallback', async () => {
    for (const suffix of [
      '',
      '?perspective=',
      '?perspective=unknown',
      '?perspective=PLAYER&perspective=DM',
      '?perspective=PLAYER&location=hidden-place',
      '?perspective=PLAYER&actorId=dm-ravenford',
    ]) {
      expect((await get(app, URL + suffix, TOKENS.player)).statusCode).toBe(400);
    }
    expect(
      (await get(app, '/campaigns/Bad%20Id/surroundings?perspective=PLAYER', TOKENS.player))
        .statusCode,
    ).toBe(400);
  });

  it('requires an acting perspective and refuses unauthorized scopes uniformly', async () => {
    expect((await get(app, `${URL}?perspective=PLAYER`)).statusCode).toBe(401);
    for (const perspective of ['DM', 'PUBLIC', 'PARTY', 'NPC:mira-vale']) {
      expect((await get(app, `${URL}?perspective=${perspective}`, TOKENS.dm)).statusCode).toBe(403);
    }
    for (const perspective of ['DM', 'CHARACTER:mira-vale', 'CHARACTER:missing', 'NPC:mira-vale']) {
      expect((await get(app, `${URL}?perspective=${perspective}`, TOKENS.player)).statusCode).toBe(
        403,
      );
    }
    const outsider = await get(app, `${URL}?perspective=PLAYER`, TOKENS.outsider);
    const absent = await get(
      app,
      '/campaigns/missing/surroundings?perspective=PLAYER',
      TOKENS.outsider,
    );
    expect(outsider.statusCode).toBe(404);
    expect(withoutRequestId(outsider)).toEqual(withoutRequestId(absent));
  });
});
