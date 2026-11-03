import { randomUUID } from 'node:crypto';

import { assetIdFor, type WorldEngine } from '@ltw/domain';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { ASSET_WORKER, AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  TOKENS,
} from '../testing/ravenford-app.ts';
import { isOwnRequest } from './own-requests.ts';

/**
 * A battle map the DM uploads (docs/adr/0057-encounters-maps-loot.md §3): the DM's alone, for a
 * place with an approved picture, re-encoded in its own shape, approved through the lineage once
 * per request, and never started by the asset worker.
 */
const ROAD = 'old-trade-road';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const PATH = `/campaigns/ravenford/entities/${ROAD}/battle-map`;

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#4a5d3a' } })
    .png()
    .toBuffer();

/** The road's approved picture: what a battle map derives from. */
async function roadPicture(engine: WorldEngine, contents: InMemoryAssetContentStore) {
  const run = async (
    commandId: string,
    actor: typeof DM | typeof ASSET_WORKER,
    command: object,
  ) => {
    const result = await engine.execute({ commandId, campaignId: 'ravenford', actor, command });
    expect(result.status).toBe('accepted');
  };
  const contentHash = await contents.put('ravenford', {
    bytes: new Uint8Array(await png(64, 48)),
    mediaType: 'image/png',
  });
  await run('test.road', DM, { type: 'RequestAsset', entityId: ROAD, variant: 'reference' });
  await run('test.road.start', ASSET_WORKER, { type: 'StartAssetJob', requestId: 'test.road#0' });
  await run('test.road.done', ASSET_WORKER, {
    type: 'CompleteAssetJob',
    requestId: 'test.road#0',
    contentHash,
    mediaType: 'image/png',
    generator: { provider: 'local', model: 'test' },
  });
  await run('test.road.ok', DM, { type: 'ApproveAsset', assetId: assetIdFor('test.road#0') });
}

async function app() {
  const engine = await seededEngine();
  const contents = new InMemoryAssetContentStore();
  const server = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
  return { engine, contents, server };
}

describe('a battle map the DM uploads', () => {
  it('is the DM’s alone, for a place with its picture, and a picture at that', async () => {
    const { engine, contents, server } = await app();
    const image = (await png(300, 200)).toString('base64');
    const body = { requestId: randomUUID(), image };
    expect((await post(server, PATH, body)).statusCode).toBe(401);
    expect((await post(server, PATH, body, TOKENS.outsider)).statusCode).toBe(404);
    expect((await post(server, PATH, body, TOKENS.player)).statusCode).toBe(403);
    // A character has no battle map; the road has no picture of its own yet.
    expect(
      (await post(server, '/campaigns/ravenford/entities/mira-vale/battle-map', body, TOKENS.dm))
        .statusCode,
    ).toBe(404);
    const bare = await post(server, PATH, body, TOKENS.dm);
    expect(bare.statusCode).toBe(409);
    expect(bare.json<{ reason: string }>().reason).toBe('no-picture');
    await roadPicture(engine, contents);
    const junk = await post(
      server,
      PATH,
      { requestId: randomUUID(), image: Buffer.from('not a picture at all').toString('base64') },
      TOKENS.dm,
    );
    expect(junk.json<{ reason: string }>().reason).toBe('image');
  });

  it('is approved in its own shape, once per request, and left alone by the worker', async () => {
    const { engine, contents, server } = await app();
    await roadPicture(engine, contents);
    const requestId = randomUUID();
    const body = { requestId, image: (await png(300, 200)).toString('base64') };
    expect((await post(server, PATH, body, TOKENS.dm)).statusCode).toBe(201);
    const state = (await engine.load('ravenford'))?.state;
    const uploaded = state?.assets.assets.get(assetIdFor(`ravenford.upload.${requestId}#0`));
    expect(uploaded).toMatchObject({
      entityId: ROAD,
      purpose: 'battle-map',
      status: 'APPROVED',
      generator: { provider: 'upload', model: 'dm-upload' },
    });
    // Kept 3:2, not cropped to the generated maps' 4:3.
    const stored = await contents.get('ravenford', uploaded?.contentHash ?? '');
    const shape = await sharp(stored?.bytes).metadata();
    expect([shape.width, shape.height]).toEqual([300, 200]);
    // A retried request uploads nothing twice.
    const commands = state?.commands.size;
    expect((await post(server, PATH, body, TOKENS.dm)).statusCode).toBe(200);
    expect((await engine.load('ravenford'))?.state.commands.size).toBe(commands);
    // The asset worker never starts an upload's request: no image model is asked for it.
    expect(isOwnRequest(`ravenford.upload.${requestId}#0`, 'ravenford')).toBe(true);
    const worker = new AssetWorker({
      engine,
      contents,
      generator: {
        id: 'never',
        generate: () => Promise.reject(new Error('the worker asked a model for an upload')),
      },
      timeoutMs: 1_000,
      skip: isOwnRequest,
      logger: createLogger({ service: 'test', level: 'silent' }),
    });
    expect(await worker.runOnce('ravenford')).toEqual({ started: 0, completed: 0, failed: 0 });
  });
});
