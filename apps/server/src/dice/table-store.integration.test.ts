import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresTableStore } from './postgres-table-store.ts';
import type { CheckRequestRecord, TableRollRecord } from './table-store.ts';

/**
 * The table's rolls on PostgreSQL (migration 0025, Stage 510): append-only rolls, the latest first
 * read back oldest first, and a request answered exactly once however answers race.
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

const roll = (rollId: string, changes: Partial<TableRollRecord> = {}): TableRollRecord => ({
  rollId,
  campaignId: 'ravenford',
  rollerId: 'elowen-starwhisper',
  subject: { kind: 'dice' },
  groups: [{ purpose: 'dice', dice: [{ sides: 20, value: 12 }], modifier: 1, total: 13 }],
  hidden: false,
  requestId: null,
  at: '2026-11-01T20:00:00.000Z',
  ...changes,
});

const request = (requestId: string): CheckRequestRecord => ({
  requestId,
  campaignId: 'ravenford',
  characterId: 'elowen-starwhisper',
  check: { kind: 'skill', skill: 'athletics' },
  mode: 'normal',
  dc: 12,
  status: 'open',
  rollId: null,
  total: null,
  at: '2026-11-01T20:00:00.000Z',
});

describe('the table rolls tables', () => {
  it('keeps rolls append-only, per campaign, the latest ones oldest first', async () => {
    const store = new PostgresTableStore(pool);
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ];
    for (const id of ids) await store.addRoll(roll(id));
    await store.addRoll(roll('00000000-0000-4000-8000-000000000009', { campaignId: 'elsewhere' }));
    const recent = await store.recentRolls('ravenford', 2);
    expect(recent.map((entry) => entry.rollId)).toEqual(ids.slice(1));
    expect(recent[0]).toEqual(roll(ids[1] ?? ''));
    await expect(pool.query('DELETE FROM ltw_table_rolls')).rejects.toThrow();
    await expect(pool.query('UPDATE ltw_table_rolls SET hidden = true')).rejects.toThrow();
  });

  it('answers a request once however answers race, and cancels only open ones', async () => {
    const store = new PostgresTableStore(pool);
    const requestId = '10000000-0000-4000-8000-000000000001';
    await store.addRequest(request(requestId));
    const answers = await Promise.all(
      ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'].map((id) =>
        store.answerRequest(roll(id, { requestId }), 15),
      ),
    );
    expect(answers.filter(Boolean)).toHaveLength(1);
    expect(await store.findRequest('ravenford', requestId)).toMatchObject({
      status: 'rolled',
      total: 15,
      dc: 12,
    });
    expect(await store.recentRolls('ravenford', 10)).toHaveLength(1);
    expect(await store.cancelRequest('ravenford', requestId)).toBe(false);
    const other = '10000000-0000-4000-8000-000000000002';
    await store.addRequest(request(other));
    expect(await store.cancelRequest('ravenford', other)).toBe(true);
    expect((await store.recentRequests('ravenford', 5)).map((entry) => entry.status)).toEqual([
      'cancelled',
      'rolled',
    ]);
  });
});
