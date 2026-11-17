import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import {
  InMemoryAgreementStore,
  type AgreementRecord,
  type AgreementStore,
} from './agreement-store.ts';
import { PostgresAgreementStore } from './postgres-agreement-store.ts';

/**
 * The table's agreement on PostgreSQL (migration 0042, Stage 740), held to the in-memory store's
 * semantics: one page a campaign, replaced when written again; for each character the newest
 * version they said "Understood" to, never an older one over a newer.
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

const PAGE: AgreementRecord = {
  campaignId: 'ravenford',
  version: 1,
  tone: 'cosy',
  toneNote: 'Like a Saturday cartoon.',
  limits: ['gore', 'torture'],
  alsoNot: 'Spiders\nClowns',
  pauseSign: 'Raise a hand.',
  ages: 'Children from eight.',
  updatedAt: '2026-11-16T10:00:00.000Z',
};

async function story(store: AgreementStore) {
  const before = await store.read('ravenford');
  await store.write(PAGE);
  await store.write({ ...PAGE, campaignId: 'another', tone: 'grim', limits: [] });
  await store.write({
    ...PAGE,
    version: 2,
    tone: 'spooky',
    limits: ['gore'],
    updatedAt: '2026-11-16T11:00:00.000Z',
  });
  const mark = { campaignId: 'ravenford', at: '2026-11-16T11:05:00.000Z' };
  await store.markUnderstood({ ...mark, characterId: 'elowen-starwhisper', version: 1 });
  await store.markUnderstood({ ...mark, characterId: 'elowen-starwhisper', version: 2 });
  // An older version never replaces a newer one.
  await store.markUnderstood({ ...mark, characterId: 'elowen-starwhisper', version: 1 });
  await store.markUnderstood({ ...mark, characterId: 'brann-ironvale', version: 1 });
  await store.markUnderstood({ ...mark, campaignId: 'another', characterId: 'x', version: 1 });
  return {
    before,
    page: await store.read('ravenford'),
    other: await store.read('another'),
    understood: await store.understood('ravenford'),
    nobody: await store.understood('nowhere'),
  };
}

describe('the table’s agreement on PostgreSQL', () => {
  it('keeps what the in-memory store keeps', async () => {
    const kept = await story(new PostgresAgreementStore(pool));
    expect(kept).toEqual(await story(new InMemoryAgreementStore()));
    expect(kept.before).toBeNull();
    expect(kept.page).toMatchObject({ version: 2, tone: 'spooky', limits: ['gore'] });
    expect(kept.other).toMatchObject({ tone: 'grim', limits: [] });
    expect(kept.understood.map((entry) => [entry.characterId, entry.version])).toEqual([
      ['brann-ironvale', 1],
      ['elowen-starwhisper', 2],
    ]);
    expect(kept.nobody).toEqual([]);
  });

  it('holds the page’s limits', async () => {
    const store = new PostgresAgreementStore(pool);
    await expect(store.write({ ...PAGE, pauseSign: 'x'.repeat(201) })).rejects.toThrow();
    await expect(store.write({ ...PAGE, alsoNot: 'x'.repeat(401) })).rejects.toThrow();
    await expect(store.write({ ...PAGE, version: 0 })).rejects.toThrow();
    expect(await store.read('ravenford')).toBeNull();
  });
});
