import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import type { HandoutRecord } from './handout-store.ts';
import { PostgresHandoutStore } from './postgres-handout-store.ts';

/** Handouts on PostgreSQL (migration 0032, Stage 630): append-only, the latest oldest first. */
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

const handout = (title: string, changes: Partial<HandoutRecord> = {}): HandoutRecord => ({
  campaignId: 'ravenford',
  handoutId: randomUUID(),
  recipientId: null,
  title,
  text: 'Read me.',
  entityId: null,
  at: '2026-11-02T10:00:00.000Z',
  ...changes,
});

describe('PostgresHandoutStore', () => {
  it('keeps handouts per campaign, append-only, the latest ones oldest first', async () => {
    const store = new PostgresHandoutStore(pool);
    const first = handout('First');
    const second = handout('Second', {
      recipientId: 'elowen-starwhisper',
      text: null,
      entityId: 'mira-vale',
    });
    await store.add(first);
    await store.add(second);
    await store.add(handout('Elsewhere', { campaignId: 'other' }));
    expect(await store.recent('ravenford', 10)).toEqual([first, second]);
    expect(await store.recent('ravenford', 1)).toEqual([second]);
    await expect(pool.query('DELETE FROM ltw_handouts')).rejects.toThrow();
    await expect(pool.query("UPDATE ltw_handouts SET title = 'x'")).rejects.toThrow();
    // A handout holds a text or a picture.
    await expect(store.add(handout('Nothing', { text: null }))).rejects.toThrow();
  });
});
