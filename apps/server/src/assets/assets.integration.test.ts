import { createPlaceholderImageGenerator } from '@ltw/ai';
import type { CommandResult, EntityAssetsResponse } from '@ltw/contracts';
import { assetIdFor, checkWorldIntegrity, replay, type WorldEngine } from '@ltw/domain';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import {
  ASHEN_CIRCLE_ID,
  TOKENS,
  get,
  post,
  ravenfordApp,
  testAiGateway,
  testAuthoring,
  withoutRequestId,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import { contentHashOf } from './content-store.ts';
import { PostgresAssetContentStore } from './postgres-content-store.ts';
import { AssetWorker } from './worker.ts';

/**
 * Asset identity on PostgreSQL (migration 0004, ADR 0022 §6): contents are
 * append-only and per campaign; the worker runs requests against the
 * PostgreSQL World Engine; an undo is refused while a job runs; the
 * lineage replays from the stored events; and a player is served only what
 * presentation could choose for it (Gate 06, G06-images-01).
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const svg = (text: string) => ({
  bytes: new TextEncoder().encode(`<svg>${text}</svg>`),
  mediaType: 'image/svg+xml' as const,
});

async function seeded(): Promise<WorldEngine> {
  const engine = createWorldEngine(pool);
  for (const submission of (await loadRavenfordSeed()).submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
  }
  return engine;
}

describe('PostgresAssetContentStore', () => {
  it('stores bytes once by content hash, per campaign, and never rewrites them', async () => {
    const store = new PostgresAssetContentStore(pool);
    const contentHash = await store.put('ravenford', svg('a'));
    expect(contentHash).toBe(contentHashOf(svg('a').bytes));
    expect(await store.put('ravenford', svg('a'))).toBe(contentHash);
    expect(await store.get('ravenford', contentHash)).toEqual(svg('a'));
    expect(await store.get('other', contentHash)).toBeNull();
    await expect(store.put('ravenford', { ...svg(''), bytes: new Uint8Array() })).rejects.toThrow();

    await expect(
      pool.query(`UPDATE ltw_asset_contents SET media_type = 'image/png'`),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ltw_asset_contents')).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE ltw_asset_contents')).rejects.toThrow(/append-only/);
    await expect(
      pool.query(
        `INSERT INTO ltw_asset_contents (campaign_id, content_hash, media_type, bytes)
         VALUES ('ravenford', 'sha256:bad', 'image/svg+xml', '\\x00')`,
      ),
    ).rejects.toThrow();
  });
});

describe('the asset worker on PostgreSQL', () => {
  it('runs a request, refuses its undo while the job runs, and replays the lineage', async () => {
    const engine = await seeded();
    const contents = new PostgresAssetContentStore(pool);
    const execute = (commandId: string, command: Record<string, unknown>) =>
      engine.execute({ commandId, campaignId: 'ravenford', actor: DM, command });
    const created = await execute('pg-asset.tomas', {
      type: 'CreateEntity',
      entityId: 'tomas-reed',
      kind: 'npc',
      name: 'Tomas Reed',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    });
    expect(created.status).toBe('accepted');
    const requested = await execute('pg-asset.request', {
      type: 'RequestAsset',
      entityId: 'tomas-reed',
      variant: 'reference',
    });
    expect(requested.status).toBe('accepted');
    const requestId = 'pg-asset.request#0';
    expect(await PostgresAssetContentStore.campaignsWithAssetWork(pool)).toEqual(['ravenford']);

    // The job starts; the generator is held while the DM tries to undo.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const undoResults: CommandResult[] = [];
    const worker = new AssetWorker({
      engine,
      contents,
      timeoutMs: 5_000,
      logger: createLogger({ service: 'pg-asset-test', level: 'silent' }),
      generator: {
        id: 'local',
        generate: async (brief) => {
          undoResults.push(
            await execute('pg-asset.undo-request', {
              type: 'UndoCommand',
              targetCommandId: 'pg-asset.request',
            }),
          );
          await held;
          return createPlaceholderImageGenerator().generate(brief);
        },
      },
    });
    const run = worker.runOnce('ravenford');
    setTimeout(release, 10);
    expect(await run).toEqual({ started: 1, completed: 1, failed: 0 });
    expect(
      undoResults.map((result) => (result.status === 'rejected' ? result.code : result.status)),
    ).toEqual(['UNDO_UNSAFE']);

    const snapshot = await engine.load('ravenford');
    const asset = snapshot?.state.assets.assets.get(assetIdFor(requestId));
    expect(asset?.status).toBe('CANDIDATE');
    expect(await contents.get('ravenford', asset?.contentHash ?? '')).not.toBeNull();
    if (!snapshot) throw new Error('missing campaign');
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);

    // A fresh engine on the same database replays the same lineage.
    const reloaded = await createWorldEngine(pool).load('ravenford');
    expect(reloaded?.state.assets).toEqual(snapshot.state.assets);
    expect(replay(reloaded?.history ?? [])).toEqual(reloaded?.state);
  });

  it('serves stored content over HTTP only to the DM before anyone sees it', async () => {
    const engine = await seeded();
    const contents = new PostgresAssetContentStore(pool);
    const execute = (commandId: string, command: Record<string, unknown>) =>
      engine.execute({ commandId, campaignId: 'ravenford', actor: DM, command });
    await execute('pg-asset.request', {
      type: 'RequestAsset',
      entityId: ASHEN_CIRCLE_ID,
      variant: 'reference',
    });
    await new AssetWorker({
      engine,
      contents,
      generator: createPlaceholderImageGenerator(),
      timeoutMs: 5_000,
      logger: createLogger({ service: 'pg-asset-test', level: 'silent' }),
    }).runOnce('ravenford');
    await execute('pg-asset.approve', {
      type: 'ApproveAsset',
      assetId: 'pg-asset.request#0~asset',
    });
    const contentHash =
      (await engine.load('ravenford'))?.state.assets.assets.get('pg-asset.request#0~asset')
        ?.contentHash ?? '';

    const app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
    try {
      const url = `/campaigns/ravenford/assets/content/${contentHash}`;
      const forDm = await get(app, `${url}?perspective=DM`, TOKENS.dm);
      expect(forDm.statusCode).toBe(200);
      expect(forDm.headers['content-type']).toBe('image/svg+xml');
      expect(forDm.body.startsWith('<svg')).toBe(true);
      // Elowen knows nothing of the Ashen Circle, and cannot see it.
      expect((await get(app, `${url}?perspective=PLAYER`, TOKENS.player)).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('serves a state picture of an entity Elowen does not observe to the DM alone (Gate 06)', async () => {
    const engine = await seeded();
    const contents = new PostgresAssetContentStore(pool);
    const execute = async (commandId: string, command: Record<string, unknown>) => {
      const result = await engine.execute({
        commandId,
        campaignId: 'ravenford',
        actor: DM,
        command,
      });
      if (result.status !== 'accepted') throw new Error(`${commandId} rejected`);
    };
    const worker = new AssetWorker({
      engine,
      contents,
      generator: createPlaceholderImageGenerator(),
      timeoutMs: 5_000,
      logger: createLogger({ service: 'pg-asset-test', level: 'silent' }),
    });
    await execute('pg-g06.ref', {
      type: 'RequestAsset',
      entityId: 'mira-vale',
      variant: 'reference',
    });
    await worker.runOnce('ravenford');
    await execute('pg-g06.ref-ok', { type: 'ApproveAsset', assetId: 'pg-g06.ref#0~asset' });
    await execute('pg-g06.dead', {
      type: 'RequestAsset',
      entityId: 'mira-vale',
      variant: 'derived',
      label: 'dead',
    });
    await worker.runOnce('ravenford');
    await execute('pg-g06.dead-ok', { type: 'ApproveAsset', assetId: 'pg-g06.dead#0~asset' });
    const assets = (await engine.load('ravenford'))?.state.assets.assets;
    const hashOf = (assetId: string) => assets?.get(assetId)?.contentHash ?? '';

    const app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
    try {
      // Elowen leaves the market square: she knows Mira Vale, and no longer observes her.
      const left = await post(
        app,
        '/campaigns/ravenford/commands',
        {
          commandId: 'pg-g06.leave',
          command: {
            type: 'EnterLocation',
            characterId: 'elowen-starwhisper',
            locationId: 'orins-alchemy',
          },
        },
        TOKENS.player,
      );
      expect(left.json<CommandResult>().status).toBe('accepted');
      const list = await get(
        app,
        '/campaigns/ravenford/entities/mira-vale/assets?perspective=PLAYER',
        TOKENS.player,
      );
      expect(list.json<EntityAssetsResponse>().assets.map((asset) => asset.contentHash)).toEqual([
        hashOf('pg-g06.ref#0~asset'),
      ]);
      const content = (hash: string, perspective: string, token: string) =>
        get(app, `/campaigns/ravenford/assets/content/${hash}?perspective=${perspective}`, token);
      const dead = hashOf('pg-g06.dead#0~asset');
      const missing = await content(`sha256:${'0'.repeat(64)}`, 'PLAYER', TOKENS.player);
      expect(withoutRequestId(await content(dead, 'PLAYER', TOKENS.player))).toEqual(
        withoutRequestId(missing),
      );
      expect((await content(dead, 'DM', TOKENS.dm)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
