import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresRestStore } from './postgres-table-store.ts';
import type { RestRecord } from './table-store.ts';

/**
 * The DM's short rests on PostgreSQL (migration 0026, Stage 530): at most one open per campaign,
 * whoever asks at the same moment, and a rest ends once.
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

const rest = (campaignId = 'ravenford'): RestRecord => ({
  restId: randomUUID(),
  campaignId,
  kind: 'short',
  startedAt: '2026-11-01T20:00:00.000Z',
  endedAt: null,
});

describe('PostgresRestStore', () => {
  it('keeps one open short rest per campaign, even when two start at once', async () => {
    const store = new PostgresRestStore(pool);
    const [first, second] = [rest(), rest()];
    const started = await Promise.all([store.startRest(first), store.startRest(second)]);
    expect(started.filter(Boolean)).toHaveLength(1);
    const open = await store.openRest('ravenford');
    expect([first.restId, second.restId]).toContain(open?.restId);
    expect(open).toMatchObject({ kind: 'short', startedAt: '2026-11-01T20:00:00.000Z' });
    // Another campaign rests on its own.
    expect(await store.startRest(rest('other-campaign'))).toBe(true);
  });

  it('ends a rest once, after which a new one may open', async () => {
    const store = new PostgresRestStore(pool);
    const first = rest();
    await store.startRest(first);
    expect(await store.endRest('ravenford', first.restId, '2026-11-01T21:00:00.000Z')).toBe(true);
    expect(await store.endRest('ravenford', first.restId, '2026-11-01T21:00:00.000Z')).toBe(false);
    expect(await store.openRest('ravenford')).toBeNull();
    expect(await store.startRest(rest())).toBe(true);
  });
});
