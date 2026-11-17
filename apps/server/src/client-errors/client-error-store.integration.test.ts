import { CLIENT_ERROR_DAYS, MAX_CLIENT_ERRORS } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import {
  InMemoryClientErrorStore,
  type ClientErrorStore,
  type NewClientError,
} from './client-error-store.ts';
import { PostgresClientErrorStore } from './postgres-client-error-store.ts';

/**
 * Client error reports on PostgreSQL (migration 0044, Stage 800), held to the in-memory store's
 * semantics: one row a distinct report of a campaign, counted when seen again, gone after thirty
 * days, a campaign's list held to its size, cleared a campaign at a time.
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

const REPORT: NewClientError = {
  campaignId: 'ravenford',
  role: 'player',
  kind: 'error',
  name: 'TypeError',
  page: 'game',
  part: 'dice',
  browser: 'chrome',
  browserVersion: 131,
  system: 'android',
  shell: 'player',
  place: [
    { file: 'index-abc.js', line: 1, column: 20 },
    { file: 'chunk-9.js', line: 4, column: 7 },
  ],
  build: 'abc123',
};
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(Date.parse('2026-11-16T18:00:00.000Z') + ms).toISOString();

async function story(store: ClientErrorStore) {
  await store.record(REPORT, at(0));
  await store.record({ ...REPORT, build: 'def456' }, at(1000));
  await store.record({ ...REPORT, part: 'chat', place: [] }, at(2000));
  await store.record({ ...REPORT, campaignId: 'other-table', role: 'dm' }, at(3000));
  await store.record({ ...REPORT, campaignId: null, role: 'nobody' }, at(4000));
  const first = await store.ofCampaign('ravenford');
  // Thirty days on, only what was seen since is left.
  await store.record({ ...REPORT, part: 'rules' }, at(CLIENT_ERROR_DAYS * DAY + 1500));
  const later = await store.ofCampaign('ravenford');
  await store.clear('ravenford');
  return {
    first,
    later,
    cleared: await store.ofCampaign('ravenford'),
    other: await store.ofCampaign('other-table'),
  };
}

describe('client error reports on PostgreSQL', () => {
  it('behave as the in-memory store does', async () => {
    const expected = await story(new InMemoryClientErrorStore());
    const actual = await story(new PostgresClientErrorStore(pool));
    expect(actual).toEqual(expected);
    expect(actual.first.map((record) => [record.part, record.count, record.build])).toEqual([
      ['chat', 1, 'abc123'],
      ['dice', 2, 'def456'],
    ]);
    expect(actual.later.map((record) => record.part)).toEqual(['rules', 'chat']);
    expect(actual.cleared).toEqual([]);
  });

  it('hold a campaign’s list to its size', async () => {
    const store = new PostgresClientErrorStore(pool);
    for (let index = 0; index < MAX_CLIENT_ERRORS + 2; index += 1) {
      await store.record({ ...REPORT, browserVersion: index }, at(index));
    }
    const list = await store.ofCampaign('ravenford');
    expect(list).toHaveLength(MAX_CLIENT_ERRORS);
    expect(list.at(-1)?.browserVersion).toBe(2);
  });

  it('keep a report of no campaign under no campaign, and refuse a row that says otherwise', async () => {
    const store = new PostgresClientErrorStore(pool);
    await store.record({ ...REPORT, campaignId: null, role: 'nobody' }, at(0));
    const { rows } = await pool.query<{ campaign_id: string; role: string }>(
      'SELECT campaign_id, role FROM ltw_client_errors',
    );
    expect(rows).toEqual([{ campaign_id: '', role: 'nobody' }]);
    await expect(store.record({ ...REPORT, role: 'nobody' }, at(0))).rejects.toThrow();
    await expect(
      store.record({ ...REPORT, name: 'A message with words' as never }, at(0)),
    ).rejects.toThrow();
  });
});
