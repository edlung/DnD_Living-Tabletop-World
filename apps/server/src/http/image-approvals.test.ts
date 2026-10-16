import { createPlaceholderImageGenerator } from '@ltw/ai';
import type {
  AssetLineageResponse,
  CommandResult,
  EntityPresentationResponse,
} from '@ltw/contracts';
import { worldTimeAt, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
} from '../testing/ravenford-app.ts';

/**
 * Approving a picture over HTTP supersedes the approved picture of its kind
 * (docs/STAGE_330_DESIGN.md "DM controls"; ADR 0035 amendment): the DM approves the newer of two
 * candidates and then the older one, and the older is what players see and what the DM's lineage
 * lists as approved — for a figure, and for a variant at night.
 */
const BASE = '/campaigns/ravenford';
const MIRA = 'mira-vale';

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let app: FastifyInstance;
let counter = 0;

beforeEach(async () => {
  engine = await seededEngine();
  contents = new InMemoryAssetContentStore();
  app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
});

const command = async (body: Record<string, unknown>) => {
  counter += 1;
  const result = (
    await post(
      app,
      `${BASE}/commands`,
      { commandId: `approval.${String(counter)}`, command: body },
      TOKENS.dm,
    )
  ).json<CommandResult>();
  if (result.status !== 'accepted') throw new Error(`${String(body['type'])} not accepted`);
  return result.commandId;
};

/** Requests the DM makes, then one run of the asset worker; their asset IDs, oldest first. */
async function candidates(requests: readonly Record<string, unknown>[]): Promise<string[]> {
  const ids: string[] = [];
  for (const request of requests) {
    ids.push(`${await command({ type: 'RequestAsset', entityId: MIRA, ...request })}#0~asset`);
  }
  await new AssetWorker({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: 1_000,
    logger: createLogger({ service: 'approval-test', level: 'silent' }),
  }).runOnce('ravenford');
  return ids;
}

const lineage = async () =>
  (await get(app, `${BASE}/assets`, TOKENS.dm)).json<AssetLineageResponse>();

const statusOf = async (assetId: string) =>
  (await lineage()).assets.find((asset) => asset.assetId === assetId)?.status;

const contentOf = async (assetId: string) =>
  (await lineage()).assets.find((asset) => asset.assetId === assetId)?.contentHash;

const playerView = async () =>
  (
    await get(app, `${BASE}/entities/${MIRA}/presentation?perspective=PLAYER`, TOKENS.player)
  ).json<EntityPresentationResponse>().presentation;

const SLOW_MS = 30_000;

describe('approving the older of two pictures of a kind', { timeout: SLOW_MS }, () => {
  it('makes it the figure players see and the one the DM’s lineage approves', async () => {
    const [reference] = await candidates([{ variant: 'reference' }]);
    await command({ type: 'ApproveAsset', assetId: reference });
    const figure = { variant: 'derived', label: 'figure', purpose: 'figure' };
    const [older = '', newer = ''] = await candidates([figure, figure]);
    await command({ type: 'ApproveAsset', assetId: newer });
    expect((await playerView()).figure?.contentHash).toBe(await contentOf(newer));

    await command({ type: 'ApproveAsset', assetId: older });
    expect((await playerView()).figure?.contentHash).toBe(await contentOf(older));
    expect([await statusOf(older), await statusOf(newer)]).toEqual(['APPROVED', 'SUPERSEDED']);
    // The bytes of the superseded figure are no longer the player's to fetch.
    const bytes = await get(
      app,
      `${BASE}/assets/content/${(await contentOf(newer)) ?? ''}?perspective=PLAYER`,
      TOKENS.player,
    );
    expect(bytes.statusCode).toBe(404);
  });

  it('makes it the variant players see in its state', async () => {
    const [reference] = await candidates([{ variant: 'reference' }]);
    await command({ type: 'ApproveAsset', assetId: reference });
    const night = { variant: 'derived', label: 'night' };
    const [older = '', newer = ''] = await candidates([night, night]);
    await command({ type: 'ApproveAsset', assetId: newer });
    await command({ type: 'ApproveAsset', assetId: older });
    await command({ type: 'AdvanceWorldTime', to: worldTimeAt(1, 22) });
    const shown = (await playerView()).image;
    expect(shown).toMatchObject({ variant: 'derived', version: 1 });
    expect(shown?.contentHash).toBe(await contentOf(older));
    expect(await statusOf(newer)).toBe('SUPERSEDED');
  });
});
