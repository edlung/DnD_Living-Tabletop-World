import { createPlaceholderImageGenerator } from '@ltw/ai';
import type {
  CommandResult,
  EntityPresentationResponse,
  ScenePresentationResponse,
} from '@ltw/contracts';
import { submissionsFromScript, worldTimeAt, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import dayTwo from '../../../../fixtures/ravenford/day-two.json' with { type: 'json' };
import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  NPC_BOUNDARY,
  TOKENS,
  get,
  plantNpcBoundary,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * World visual state over HTTP (docs/adr/0023-world-visual-state.md). The
 * Ravenford Day 2 script runs after the seed; Elowen then visits Orin's
 * Alchemy, where Gate 04's hooded watcher stands, and returns at noon.
 */
const BASE = '/campaigns/ravenford';
const WATCHER = 'nb-hooded-watcher';
const DAY1 = worldTimeAt(1, 10);
const NOON = worldTimeAt(2, 12);
const INSIDE = worldTimeAt(2, 11);
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let app: FastifyInstance;
let counter = 0;

const command = async (token: string, body: Record<string, unknown>) => {
  counter += 1;
  const response = await post(
    app,
    `${BASE}/commands`,
    { commandId: `visual-route.${String(counter)}`, command: body },
    token,
  );
  const result = response.json<CommandResult>();
  if (result.status !== 'accepted') throw new Error(`${String(body['type'])} rejected`);
  return result;
};

async function approve(entityId: string) {
  const requested = await command(TOKENS.dm, {
    type: 'RequestAsset',
    entityId,
    variant: 'reference',
  });
  await new AssetWorker({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: 1_000,
    logger: createLogger({ service: 'visual-route-test', level: 'silent' }),
  }).runOnce('ravenford');
  await command(TOKENS.dm, { type: 'ApproveAsset', assetId: `${requested.commandId}#0~asset` });
}

const view = (path: string, perspective: string, at?: number, token: string = TOKENS.player) =>
  get(
    app,
    `${BASE}/${path}?perspective=${perspective}${at === undefined ? '' : `&at=${String(at)}`}`,
    token,
  );

beforeEach(async () => {
  engine = await seededEngine();
  await plantNpcBoundary(engine);
  contents = new InMemoryAssetContentStore();
  app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
  await approve(WATCHER);
  for (const submission of submissionsFromScript({
    campaignId: 'ravenford',
    actor: DM,
    commands: dayTwo.commands,
    commandIdPrefix: 'ravenford.day-two',
  })) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`day two: ${result.code}`);
  }
  const enter = (locationId: string) =>
    command(TOKENS.player, {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId,
    });
  await enter('orins-alchemy');
  await command(TOKENS.dm, { type: 'AdvanceWorldTime', to: NOON });
  await enter('market-square');
});

describe('Ravenford, Day 1 and Day 2, over HTTP', () => {
  it('resolves the square’s weather and phase from state, for the DM and for Elowen', async () => {
    for (const [perspective, token] of [
      ['DM', TOKENS.dm],
      ['PLAYER', TOKENS.player],
    ] as const) {
      const day1 = await view('locations/market-square/scene', perspective, DAY1, token);
      // Day 2 at noon, when Elowen stood in the square again.
      const day2 = await view('locations/market-square/scene', perspective, NOON, token);
      expect(day1.statusCode).toBe(200);
      expect(day1.json<ScenePresentationResponse>()).toMatchObject({
        worldTime: DAY1,
        phase: 'day',
        location: { weather: 'clear' },
      });
      expect(day2.json<ScenePresentationResponse>()).toMatchObject({
        phase: 'day',
        location: { weather: 'rain' },
      });
    }
  });

  it('refuses a time after the clock and anything unseen alike', async () => {
    expect(
      (await view('locations/market-square/scene', 'DM', worldTimeAt(3), TOKENS.dm)).statusCode,
    ).toBe(400);
    expect(
      (await view('locations/market-square/scene', 'DM', Number.NaN, TOKENS.dm)).statusCode,
    ).toBe(400);
    expect(
      (await view('entities/mira-vale/presentation', 'PLAYER', undefined, TOKENS.outsider))
        .statusCode,
    ).toBe(404);
    expect(
      (await get(app, `${BASE}/entities/mira-vale/presentation?perspective=PLAYER`)).statusCode,
    ).toBe(401);
    expect((await view('entities/mira-vale/presentation', 'DM')).statusCode).toBe(403);
  });
});

describe('the hooded watcher, as Elowen saw it', () => {
  it('shows it only for the time she stood beside it, with nothing that names it', async () => {
    const missing = await view('entities/no-such-entity/presentation', 'PLAYER');
    for (const at of [DAY1, undefined]) {
      expect(
        withoutRequestId(await view(`entities/${WATCHER}/presentation`, 'PLAYER', at)),
      ).toEqual(withoutRequestId(missing));
    }
    const inside = await view(`entities/${WATCHER}/presentation`, 'PLAYER', INSIDE);
    expect(inside.statusCode).toBe(200);
    const body = inside.json<EntityPresentationResponse>();
    expect(body.presentation).toMatchObject({ observed: true, status: 'active', weather: null });
    for (const marker of [...NPC_BOUNDARY.neverSaid['*'], '~asset', '#']) {
      expect(inside.body).not.toContain(marker);
    }

    const contentHash = body.presentation.image?.contentHash ?? '';
    const content = (at?: number) =>
      get(
        app,
        `${BASE}/assets/content/${contentHash}?perspective=PLAYER${at === undefined ? '' : `&at=${String(at)}`}`,
        TOKENS.player,
      );
    expect((await content(INSIDE)).statusCode).toBe(200);
    expect((await content()).statusCode).toBe(404);
    expect((await content(DAY1)).statusCode).toBe(404);
    expect((await content(worldTimeAt(3))).statusCode).toBe(400);

    const shop = await view('locations/orins-alchemy/scene', 'PLAYER', INSIDE);
    expect(
      shop.json<ScenePresentationResponse>().present.map((entity) => entity.entityId),
    ).toContain(WATCHER);
    const shopNow = await view('locations/orins-alchemy/scene', 'PLAYER');
    expect(shopNow.json<ScenePresentationResponse>().present).toEqual([]);
  });
});
