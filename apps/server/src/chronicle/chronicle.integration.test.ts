import type {
  ChronicleListResponse,
  ChronicleTraceView,
  GenerateChronicleResponse,
} from '@ltw/contracts';
import { checkWorldIntegrity, replay } from '@ltw/domain';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresAiTraceStore } from '../ai/postgres-trace-store.ts';
import { TOKENS, get, post, ravenfordApp, testAiGateway } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';

/**
 * The Chronicle on PostgreSQL (ADR 0024 §4): a chapter is recorded in the
 * campaign's event store with its rendering traced; a restarted server reads
 * the same chapter, and the stored history replays to the same state.
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

describe('the Chronicle on PostgreSQL', () => {
  it('records a chapter, traces its rendering, and reads it back after a restart', async () => {
    const engine = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
    const traces = new PostgresAiTraceStore(pool);
    const app = await ravenfordApp(engine, { ...testAiGateway(), traces });
    const generated = await post(
      app,
      '/campaigns/ravenford/chronicle',
      { title: 'Chapter I — Shadows on the Trade Road', perspective: 'PARTY', from: 0 },
      TOKENS.dm,
    );
    expect(generated.statusCode).toBe(200);
    const { rendering, chronicleId } = generated.json<GenerateChronicleResponse>();
    const first = (
      await get(app, '/campaigns/ravenford/chronicle?perspective=PARTY', TOKENS.player)
    ).json<ChronicleListResponse>();
    await app.close();

    const trace = (await traces.get(
      'ravenford',
      rendering.traceId ?? '',
    )) as ChronicleTraceView | null;
    expect(trace).toMatchObject({ purpose: 'chronicle', status: 'RENDERED', canonicalEvents: [] });

    const restarted = createWorldEngine(pool);
    const again = await ravenfordApp(restarted, { ...testAiGateway(), traces });
    const read = (
      await get(again, '/campaigns/ravenford/chronicle?perspective=PARTY', TOKENS.player)
    ).json<ChronicleListResponse>();
    await again.close();
    expect(read).toEqual(first);
    expect(read.chapters[0]?.chronicleId).toBe(chronicleId);

    const snapshot = await restarted.load('ravenford');
    expect(snapshot && replay(snapshot.history)).toEqual(snapshot?.state);
    expect(checkWorldIntegrity(snapshot?.state ?? replay([]))).toEqual([]);
  });
});
