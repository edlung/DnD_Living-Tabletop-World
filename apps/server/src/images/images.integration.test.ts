import { createCombatEngine } from '@ltw/combat';
import type {
  AssetLineageResponse,
  CommandResult,
  EntityPresentationResponse,
} from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  redecideEffective,
  replay,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresAssetContentStore } from '../assets/postgres-content-store.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { insertHistory, loadHistoryRows } from '../testing/history-rows.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';
import { PostgresEventStore } from '../world-engine/postgres-event-store.ts';
import { importCuratedSet } from './curated-import.ts';
import { loadCuratedSet } from './curated-set.ts';

/**
 * Images on PostgreSQL (docs/adr/0035-images.md): the asset lineage the revision before purposes
 * stored (fixtures/history/5da1b05-asset-lineage.json) is read by the current store as images;
 * the approvals the revision before an approval superseded its kind stored
 * (fixtures/history/80d06df-approved-kinds.json) read as that writer approved them, and the next
 * approval of a kind supersedes them all; and the curated set imports into a stored campaign
 * through real commands, once, with its bytes in `ltw_asset_contents`, so a fresh install shows it
 * and a rerun changes nothing.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;
const apps: FastifyInstance[] = [];
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const logger = createLogger({ service: 'images-it', level: 'silent' });

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await pool.end();
  await database.drop();
});

const engineOnDatabase = (namespace: number) =>
  new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });

async function served(engine: WorldEngine): Promise<FastifyInstance> {
  const app = await ravenfordApp(
    engine,
    testAiGateway(),
    testAuthoring(),
    new PostgresAssetContentStore(pool),
  );
  apps.push(app);
  return app;
}

describe('the lineage written before purposes, on PostgreSQL', () => {
  it('is read as images by the current store, and verifies', async () => {
    const history = await loadHistoryRows('5da1b05-asset-lineage');
    await insertHistory(pool, history);
    const engine = engineOnDatabase(61);
    const app = await served(engine);
    const lineage = (
      await get(app, '/campaigns/ravenford/assets', TOKENS.dm)
    ).json<AssetLineageResponse>();
    expect(lineage.requests.length).toBeGreaterThan(0);
    expect(new Set(lineage.requests.map((request) => request.purpose))).toEqual(new Set(['image']));
    expect(new Set(lineage.assets.map((asset) => asset.purpose))).toEqual(new Set(['image']));
    expect(
      lineage.requests.find((request) => request.requestId.includes('legacy-request-orin')),
    ).toMatchObject({ status: 'FAILED', failure: 'REFUSED' });

    const snapshot = await engine.load('ravenford');
    if (!snapshot) throw new Error('missing campaign');
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(
      redecideEffective(
        await engine.commandLog('ravenford'),
        snapshot,
        () => 0,
        createCombatEngine(),
      ),
    ).toBeNull();
  });
});

describe('the approvals written before an approval superseded its kind, on PostgreSQL', () => {
  it('read as that writer approved them; the next approval of a kind supersedes them all', async () => {
    const history = await loadHistoryRows('80d06df-approved-kinds');
    await insertHistory(pool, history);
    const engine = engineOnDatabase(64);
    const app = await served(engine);
    const asset = (name: string) => `${history.labels[name] ?? ''}#0~asset`;
    const nights = [1, 2, 3].map((n) => asset(`request-mira-night-${String(n)}`));
    const statuses = async () => {
      const lineage = (
        await get(app, '/campaigns/ravenford/assets', TOKENS.dm)
      ).json<AssetLineageResponse>();
      return nights.map((id) => lineage.assets.find((shown) => shown.assetId === id)?.status);
    };
    expect(await statuses()).toEqual(['APPROVED', 'APPROVED', 'CANDIDATE']);

    const approved = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: 'kinds-it-approve', command: { type: 'ApproveAsset', assetId: nights[2] } },
      TOKENS.dm,
    );
    expect(approved.json<CommandResult>()).toMatchObject({ status: 'accepted' });
    expect(await statuses()).toEqual(['SUPERSEDED', 'SUPERSEDED', 'APPROVED']);
    const stored = await pool.query<{ schema_version: number; payload: unknown }>(
      `SELECT schema_version, payload FROM ltw_events
        WHERE command_id = 'http:dm-ravenford:kinds-it-approve'`,
    );
    expect(stored.rows).toEqual([
      {
        schema_version: 3,
        payload: expect.objectContaining({ supersedes: [nights[0], nights[1]] }) as unknown,
      },
    ]);

    const snapshot = await engine.load('ravenford');
    if (!snapshot) throw new Error('missing campaign');
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(
      redecideEffective(
        await engine.commandLog('ravenford'),
        snapshot,
        () => 0,
        createCombatEngine(),
      ),
    ).toBeNull();
  });
});

describe('the curated set on PostgreSQL', () => {
  it('imports once through real commands, stores each picture once, and shows it after a restart', async () => {
    const engine = await seededEngine(
      new PostgresEventStore(pool),
      undefined,
      undefined,
      RAVENFORD_RU_FIXTURES_DIR,
    );
    const set = await loadCuratedSet();
    const contents = new PostgresAssetContentStore(pool);
    const pictures = set.entries.reduce((sum, entry) => sum + entry.entityIds.length, 0);
    expect(await importCuratedSet({ engine, contents, set, logger }, 'ravenford', DM)).toEqual({
      imported: pictures,
      present: 0,
      skipped: 0,
    });
    const stored = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM ltw_asset_contents WHERE campaign_id = $1',
      ['ravenford'],
    );
    expect(stored.rows[0]?.count).toBe(new Set(set.entries.map((entry) => entry.sha256)).size);

    // A second process (a rerun of the seed): every command a duplicate, nothing appended.
    const again = engineOnDatabase(62);
    const version = (await again.load('ravenford'))?.state.version;
    expect(
      await importCuratedSet(
        { engine: again, contents: new PostgresAssetContentStore(pool), set, logger },
        'ravenford',
        DM,
      ),
    ).toEqual({ imported: 0, present: pictures, skipped: 0 });
    expect((await again.load('ravenford'))?.state.version).toBe(version);

    const app = await served(engineOnDatabase(63));
    const scene = (
      await get(
        app,
        '/campaigns/ravenford/entities/market-square/presentation?perspective=PLAYER',
        TOKENS.player,
      )
    ).json<EntityPresentationResponse>();
    expect(scene.presentation.image).toMatchObject({ purpose: 'image', mediaType: 'image/webp' });
    const bytes = await get(
      app,
      `/campaigns/ravenford/assets/content/${scene.presentation.image?.contentHash ?? ''}?perspective=PLAYER`,
      TOKENS.player,
    );
    expect(bytes.statusCode).toBe(200);
    expect(bytes.headers['content-type']).toBe('image/webp');
  });
});
