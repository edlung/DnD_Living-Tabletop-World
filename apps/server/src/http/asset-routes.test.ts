import { createPlaceholderImageGenerator } from '@ltw/ai';
import type { AssetLineageResponse, CommandResult, EntityAssetsResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  ASHEN_CIRCLE_ID,
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
 * Asset reads over HTTP (docs/adr/0022-asset-identity.md §5–§6; owner
 * decision: only what the character knows or sees, only safe fields). The
 * Gate 04 hooded watcher is an NPC whose name and description no player may
 * ever learn: its image is shown once Elowen sees it, and nothing else.
 */
const BASE = '/campaigns/ravenford';
const WATCHER = 'nb-hooded-watcher';
const MIRA = 'mira-vale';

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let app: FastifyInstance;
let counter = 0;

const command = async (token: string, body: Record<string, unknown>) => {
  counter += 1;
  const response = await post(
    app,
    `${BASE}/commands`,
    { commandId: `asset-route.${String(counter)}`, command: body },
    token,
  );
  return response.json<CommandResult>();
};

const runWorker = () =>
  new AssetWorker({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: 1_000,
    logger: createLogger({ service: 'asset-route-test', level: 'silent' }),
  }).runOnce('ravenford');

/** Requests, generates, and approves a reference (or a variant); returns its asset ID. */
async function approvedAsset(entityId: string, extra: Record<string, unknown> = {}) {
  const requested = await command(TOKENS.dm, {
    type: 'RequestAsset',
    entityId,
    variant: 'reference',
    ...extra,
  });
  if (requested.status !== 'accepted') throw new Error(`request ${JSON.stringify(requested)}`);
  await runWorker();
  const assetId = `${requested.commandId}#0~asset`;
  const approved = await command(TOKENS.dm, { type: 'ApproveAsset', assetId });
  if (approved.status !== 'accepted') throw new Error('approve rejected');
  return assetId;
}

const playerAssets = (entityId: string, perspective = 'PLAYER') =>
  get(app, `${BASE}/entities/${entityId}/assets?perspective=${perspective}`, TOKENS.player);

beforeEach(async () => {
  engine = await seededEngine();
  await plantNpcBoundary(engine);
  contents = new InMemoryAssetContentStore();
  app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
});

describe('asset commands over the command route', () => {
  it('lets the DM request and approve, and refuses players and worker reports', async () => {
    expect(
      await command(TOKENS.player, { type: 'RequestAsset', entityId: MIRA, variant: 'reference' }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const requested = await command(TOKENS.dm, {
      type: 'RequestAsset',
      entityId: MIRA,
      variant: 'reference',
    });
    expect(requested.status).toBe('accepted');
    expect(
      await command(TOKENS.dm, { type: 'StartAssetJob', requestId: `${requested.commandId}#0` }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('the DM lineage', () => {
  it('is the DM’s alone', async () => {
    await approvedAsset(MIRA);
    const lineage = await get(app, `${BASE}/assets`, TOKENS.dm);
    expect(lineage.statusCode).toBe(200);
    expect(lineage.json<AssetLineageResponse>()).toMatchObject({
      requests: [expect.objectContaining({ entityId: MIRA, status: 'COMPLETED' })],
      assets: [expect.objectContaining({ entityId: MIRA, status: 'CANONICAL' })],
      canonical: [expect.objectContaining({ entityId: MIRA })],
    });
    expect((await get(app, `${BASE}/assets`, TOKENS.player)).statusCode).toBe(403);
    expect((await get(app, `${BASE}/assets`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/assets`)).statusCode).toBe(401);
    expect((await get(app, '/campaigns/elsewhere/assets', TOKENS.dm)).statusCode).toBe(404);
  });
});

describe('player metadata isolation', () => {
  it('shows the hooded watcher’s image once Elowen sees it, and nothing that names it', async () => {
    await approvedAsset(WATCHER);
    await approvedAsset(MIRA, { audience: 'dm' });
    await approvedAsset(ASHEN_CIRCLE_ID);
    const missing = await playerAssets('no-such-entity');

    // Not yet seen, never known: identical to an entity that does not exist.
    const unseen = await playerAssets(WATCHER);
    expect(withoutRequestId(unseen)).toEqual(withoutRequestId(missing));
    expect(withoutRequestId(await playerAssets(ASHEN_CIRCLE_ID))).toEqual(
      withoutRequestId(missing),
    );

    const entered = await command(TOKENS.player, {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId: 'orins-alchemy',
    });
    expect(entered.status).toBe('accepted');
    for (const perspective of ['PLAYER', 'PARTY']) {
      const seen = await playerAssets(WATCHER, perspective);
      expect(seen.statusCode).toBe(200);
      const body = seen.json<EntityAssetsResponse>();
      expect(body.assets).toEqual([
        {
          variant: 'reference',
          purpose: 'image',
          contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as string,
          mediaType: 'image/svg+xml',
        },
      ]);
      for (const marker of [...NPC_BOUNDARY.neverSaid['*'], WATCHER, '~asset', 'request']) {
        expect(seen.body).not.toContain(marker);
      }
    }
    // A DM-only image of a known NPC is never listed for a player.
    const mira = await playerAssets(MIRA);
    expect(mira.statusCode).toBe(200);
    expect(mira.json<EntityAssetsResponse>().assets).toEqual([]);
    // Even what players may never see is shown only through the DM's own views.
    expect(withoutRequestId(await playerAssets(ASHEN_CIRCLE_ID))).toEqual(
      withoutRequestId(missing),
    );
  });

  it('serves bytes only to a perspective that may see them, as an image that cannot run', async () => {
    const watcher = await approvedAsset(WATCHER);
    const dmOnly = await approvedAsset(MIRA, { audience: 'dm' });
    const lineage = (await get(app, `${BASE}/assets`, TOKENS.dm)).json<AssetLineageResponse>();
    const hashOf = (assetId: string) =>
      lineage.assets.find((asset) => asset.assetId === assetId)?.contentHash ?? '';
    const content = (contentHash: string, token: string = TOKENS.player, perspective = 'PLAYER') =>
      get(app, `${BASE}/assets/content/${contentHash}?perspective=${perspective}`, token);
    const missing = await content(`sha256:${'0'.repeat(64)}`);
    expect(missing.statusCode).toBe(404);

    expect(withoutRequestId(await content(hashOf(watcher)))).toEqual(withoutRequestId(missing));
    expect(withoutRequestId(await content(hashOf(dmOnly)))).toEqual(withoutRequestId(missing));

    await command(TOKENS.player, {
      type: 'EnterLocation',
      characterId: 'elowen-starwhisper',
      locationId: 'orins-alchemy',
    });
    const served = await content(hashOf(watcher));
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/svg+xml');
    expect(served.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toBe('no-store');
    expect(served.body.startsWith('<svg')).toBe(true);
    for (const marker of NPC_BOUNDARY.neverSaid['*']) expect(served.body).not.toContain(marker);

    expect((await content(hashOf(dmOnly), TOKENS.dm, 'DM')).statusCode).toBe(200);
    expect((await content(hashOf(watcher), TOKENS.outsider)).statusCode).toBe(404);
    expect((await content('not-a-hash')).statusCode).toBe(400);
  });

  it('lets the DM look at a candidate before approving it, and no player', async () => {
    const requested = await command(TOKENS.dm, {
      type: 'RequestAsset',
      entityId: MIRA,
      variant: 'reference',
    });
    await runWorker();
    const lineage = (await get(app, `${BASE}/assets`, TOKENS.dm)).json<AssetLineageResponse>();
    const candidate = lineage.assets.find(
      (asset) => asset.requestId === `${requested.commandId}#0`,
    );
    expect(candidate?.status).toBe('CANDIDATE');
    const url = `${BASE}/assets/content/${candidate?.contentHash ?? ''}`;
    expect((await get(app, `${url}?perspective=DM`, TOKENS.dm)).statusCode).toBe(200);
    expect((await get(app, `${url}?perspective=PLAYER`, TOKENS.player)).statusCode).toBe(404);
  });
});
