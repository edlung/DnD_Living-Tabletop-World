import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresReflectionStore } from './postgres-reflection-store.ts';
import { InMemoryReflectionStore, type ReflectionStore } from './reflection-store.ts';

/**
 * Stars and wishes on PostgreSQL (migration 0040, Stage 720), held to the in-memory store's
 * semantics: one entry an author a session, replaced when written again with its first time kept,
 * removed when taken away.
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

async function story(store: ReflectionStore) {
  const entry = { campaignId: 'ravenford', sessionId: 'evening-one', star: 'A star', wish: '' };
  await store.put({
    ...entry,
    authorId: 'elowen-starwhisper',
    updatedAt: '2026-11-15T20:00:00.000Z',
  });
  await store.put({
    ...entry,
    authorId: null,
    wish: 'A wish',
    updatedAt: '2026-11-15T20:01:00.000Z',
  });
  await store.put({
    ...entry,
    authorId: 'elowen-starwhisper',
    star: 'A brighter star',
    updatedAt: '2026-11-15T20:05:00.000Z',
  });
  await store.put({
    ...entry,
    campaignId: 'another',
    authorId: 'elowen-starwhisper',
    updatedAt: '2026-11-15T20:06:00.000Z',
  });
  await store.put({ ...entry, authorId: 'brann-ironvale', updatedAt: '2026-11-15T20:07:00.000Z' });
  await store.remove('ravenford', 'evening-one', 'brann-ironvale');
  await store.remove('ravenford', 'evening-one', 'nobody');
  return store.ofCampaign('ravenford');
}

describe('PostgresReflectionStore', () => {
  it('keeps one entry an author a session as the in-memory store does', async () => {
    const expected = await story(new InMemoryReflectionStore());
    expect(expected).toEqual([
      {
        campaignId: 'ravenford',
        sessionId: 'evening-one',
        authorId: 'elowen-starwhisper',
        star: 'A brighter star',
        wish: '',
        writtenAt: '2026-11-15T20:00:00.000Z',
        updatedAt: '2026-11-15T20:05:00.000Z',
      },
      {
        campaignId: 'ravenford',
        sessionId: 'evening-one',
        authorId: null,
        star: 'A star',
        wish: 'A wish',
        writtenAt: '2026-11-15T20:01:00.000Z',
        updatedAt: '2026-11-15T20:01:00.000Z',
      },
    ]);
    expect(await story(new PostgresReflectionStore(pool))).toEqual(expected);
  });

  it('refuses an empty entry and words over the length', async () => {
    const store = new PostgresReflectionStore(pool);
    const entry = {
      campaignId: 'ravenford',
      sessionId: 'evening-one',
      authorId: 'elowen-starwhisper',
      updatedAt: '2026-11-15T20:00:00.000Z',
    };
    await expect(store.put({ ...entry, star: '', wish: '' })).rejects.toThrow();
    await expect(store.put({ ...entry, star: 'x'.repeat(281), wish: '' })).rejects.toThrow();
  });
});
