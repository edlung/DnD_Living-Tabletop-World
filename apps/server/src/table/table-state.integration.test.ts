import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresTableStateStore } from './postgres-table-state-store.ts';
import { FRESH_TABLE } from './table-state.ts';

/** The table's state on PostgreSQL (migration 0029, Stage 620): one row per campaign, replaced. */
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

describe('PostgresTableStateStore', () => {
  it('reads a fresh table, then what was written last, per campaign', async () => {
    const store = new PostgresTableStateStore(pool);
    expect(await store.read('ravenford')).toEqual(FRESH_TABLE);
    await store.write(
      'ravenford',
      { mode: 'online', paused: true, absent: ['brann-ironvale'] },
      '2026-11-02T10:00:00.000Z',
    );
    await store.write(
      'ravenford',
      { mode: 'online', paused: false, absent: ['brann-ironvale', 'maren-ashby'] },
      '2026-11-02T10:05:00.000Z',
    );
    expect(await store.read('ravenford')).toEqual({
      mode: 'online',
      paused: false,
      absent: ['brann-ironvale', 'maren-ashby'],
    });
    expect(await store.read('other-table')).toEqual(FRESH_TABLE);
  });
});
