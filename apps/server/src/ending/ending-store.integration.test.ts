import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryEndingStore, type EndingStore, type KeepsakeRecord } from './ending-store.ts';
import { PostgresEndingStore } from './postgres-ending-store.ts';

/**
 * A campaign's end and keepsakes on PostgreSQL (migration 0043, Stage 780), held to the in-memory
 * store's semantics: one end a campaign, gone when reopened; one keepsake a hero, replaced when
 * chosen again; a reopening keeps the keepsakes.
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

const KEPT: KeepsakeRecord = {
  campaignId: 'ravenford',
  characterId: 'elowen-starwhisper',
  kind: 'item',
  refId: 'item-5a1c7e30',
  label: 'A caravan cloak',
  line: 'It still smells of the road.',
  keptAt: '2026-11-16T10:05:00.000Z',
};

async function story(store: EndingStore) {
  const before = await store.read('ravenford');
  await store.finish({
    campaignId: 'ravenford',
    finishedAt: '2026-11-16T10:00:00.000Z',
    line: 'Home.',
  });
  await store.finish({ campaignId: 'another', finishedAt: '2026-11-16T10:00:00.000Z', line: '' });
  await store.finish({
    campaignId: 'ravenford',
    finishedAt: '2026-11-16T10:00:00.000Z',
    line: 'Home at last.',
  });
  await store.keep(KEPT);
  await store.keep({
    ...KEPT,
    characterId: 'brann-ironvale',
    kind: 'chapter',
    refId: 'chapter.1',
    label: 'The bridge',
    line: '',
  });
  await store.keep({ ...KEPT, line: 'Mine.', keptAt: '2026-11-16T10:06:00.000Z' });
  await store.keep({ ...KEPT, campaignId: 'another', characterId: 'x' });
  await store.keep({ ...KEPT, characterId: 'maren-ashby' });
  await store.drop('ravenford', 'maren-ashby');
  await store.drop('ravenford', 'nobody');
  const finished = await store.read('ravenford');
  await store.reopen('ravenford');
  return {
    before,
    finished,
    reopened: await store.read('ravenford'),
    other: await store.read('another'),
    // A reopening keeps what the heroes chose.
    keepsakes: await store.keepsakes('ravenford'),
    nobody: await store.keepsakes('nowhere'),
  };
}

describe('a campaign’s end on PostgreSQL', () => {
  it('keeps what the in-memory store keeps', async () => {
    const kept = await story(new PostgresEndingStore(pool));
    expect(kept).toEqual(await story(new InMemoryEndingStore()));
    expect(kept.before).toBeNull();
    expect(kept.finished).toMatchObject({ line: 'Home at last.' });
    expect(kept.reopened).toBeNull();
    expect(kept.other).toMatchObject({ line: '' });
    expect(kept.keepsakes.map((entry) => [entry.characterId, entry.kind, entry.line])).toEqual([
      ['brann-ironvale', 'chapter', ''],
      ['elowen-starwhisper', 'item', 'Mine.'],
    ]);
    expect(kept.nobody).toEqual([]);
  });

  it('holds the limits', async () => {
    const store = new PostgresEndingStore(pool);
    await expect(
      store.finish({ campaignId: 'ravenford', finishedAt: KEPT.keptAt, line: 'x'.repeat(281) }),
    ).rejects.toThrow();
    await expect(store.keep({ ...KEPT, line: 'x'.repeat(201) })).rejects.toThrow();
    await expect(store.keep({ ...KEPT, label: '' })).rejects.toThrow();
    expect(await store.read('ravenford')).toBeNull();
    expect(await store.keepsakes('ravenford')).toEqual([]);
  });
});
