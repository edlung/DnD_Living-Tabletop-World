import { randomUUID } from 'node:crypto';

import { MAX_MARKS } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryMarkStore, type MarkRecord, type MarkStore } from './mark-store.ts';
import { PostgresMarkStore } from './postgres-mark-store.ts';

/**
 * The table's marks on PostgreSQL (migration 0035, Stage 670c), held to the in-memory store's
 * semantics: per run of a fight, oldest first, a ping gone once expired, one DM pointer, another
 * fight's marks swept by the next mark, the oldest giving way past the limit, the players' leave
 * stored.
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

const at = (second: number) => new Date(Date.UTC(2026, 10, 3, 12, 0, second)).toISOString();
const FIGHT = randomUUID();
const LATER_FIGHT = randomUUID();
const mark = (
  kind: MarkRecord['kind'],
  second: number,
  expires: number | null = null,
  fightId = FIGHT,
): MarkRecord => ({
  campaignId: 'ravenford',
  fightId,
  markId: randomUUID(),
  authorId: 'dm-ravenford',
  byDm: true,
  kind,
  ...(kind === 'stroke' || kind === 'area'
    ? { squares: [{ x: 1, y: 1 }] }
    : { square: { x: second % 10, y: 0 } }),
  createdAt: at(second),
  expiresAt: expires === null ? null : at(expires),
});

async function behaves(store: MarkStore) {
  const ping = mark('ping', 1, 5);
  expect(await store.add(ping)).toBe(true);
  expect(await store.add(ping)).toBe(false);
  await store.add(mark('pointer', 2));
  await store.add(mark('pointer', 3));
  await store.add(mark('stroke', 4));
  expect((await store.list('ravenford', FIGHT, at(4))).map((one) => one.kind)).toEqual([
    'ping',
    'pointer',
    'stroke',
  ]);
  // The ping is gone once expired.
  expect((await store.list('ravenford', FIGHT, at(6))).map((one) => one.kind)).toEqual([
    'pointer',
    'stroke',
  ]);
  // A later fight shows none of them, and its first mark sweeps them.
  expect(await store.list('ravenford', LATER_FIGHT, at(6))).toEqual([]);
  await store.add(mark('area', 7, null, LATER_FIGHT));
  expect(await store.list('ravenford', FIGHT, at(7))).toEqual([]);
  expect((await store.list('ravenford', LATER_FIGHT, at(7))).map((one) => one.kind)).toEqual([
    'area',
  ]);
  expect(await store.playersMayMark('ravenford')).toBe(false);
  await store.setPlayersMayMark('ravenford', true);
  expect(await store.playersMayMark('ravenford')).toBe(true);
  expect(await store.clear('ravenford')).toBe(1);
  expect(await store.list('ravenford', LATER_FIGHT, at(8))).toEqual([]);
}

async function limited(store: MarkStore) {
  for (let second = 0; second < MAX_MARKS + 5; second += 1) await store.add(mark('area', second));
  const kept = await store.list('ravenford', FIGHT, at(0));
  expect(kept).toHaveLength(MAX_MARKS);
  expect(kept[0]?.createdAt).toBe(at(5));
}

describe('the table’s marks on PostgreSQL', () => {
  it('keep, expire and clear as the in-memory store does', async () => {
    await behaves(new InMemoryMarkStore());
    await behaves(new PostgresMarkStore(pool));
  });

  it('let the oldest give way past the limit', async () => {
    await limited(new InMemoryMarkStore());
    await limited(new PostgresMarkStore(pool));
  });
});
