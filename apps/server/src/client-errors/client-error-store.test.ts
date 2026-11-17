import { CLIENT_ERROR_DAYS, MAX_CLIENT_ERRORS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  InMemoryClientErrorStore,
  MAX_UNPLACED_CLIENT_ERRORS,
  fingerprintOf,
  type NewClientError,
} from './client-error-store.ts';

/** The reference semantics of the list of client error reports (docs/adr/0073-table-ideas.md §1). */
export const REPORT: NewClientError = {
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
  place: [{ file: 'index-abc.js', line: 1, column: 20 }],
  build: 'abc123',
};
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(Date.parse('2026-11-16T18:00:00.000Z') + ms).toISOString();

describe('the list of client error reports', () => {
  it('counts a report seen again and keeps when it was first seen', async () => {
    const store = new InMemoryClientErrorStore();
    await store.record(REPORT, at(0));
    await store.record({ ...REPORT, build: 'def456' }, at(60_000));
    const [record, ...rest] = await store.ofCampaign('ravenford');
    expect(rest).toEqual([]);
    expect(record).toMatchObject({ count: 2, firstAt: at(0), lastAt: at(60_000), build: 'def456' });
  });

  it('tells reports apart by every field but the build', () => {
    const base = fingerprintOf(REPORT);
    expect(fingerprintOf({ ...REPORT, build: 'other' })).toBe(base);
    expect(fingerprintOf({ ...REPORT, campaignId: null })).toBe(base);
    for (const other of [
      { ...REPORT, role: 'dm' as const },
      { ...REPORT, kind: 'render' as const },
      { ...REPORT, name: 'RangeError' as const },
      { ...REPORT, part: 'chat' as const },
      { ...REPORT, browserVersion: 132 },
      { ...REPORT, place: [{ file: 'index-abc.js', line: 1, column: 21 }] },
      { ...REPORT, place: [] },
    ]) {
      expect(fingerprintOf(other)).not.toBe(base);
    }
  });

  it('lists the latest seen first, each campaign its own', async () => {
    const store = new InMemoryClientErrorStore();
    await store.record(REPORT, at(0));
    await store.record({ ...REPORT, part: 'chat' }, at(1000));
    await store.record({ ...REPORT, campaignId: 'other-table' }, at(2000));
    await store.record({ ...REPORT, campaignId: null, role: 'nobody' }, at(3000));
    expect((await store.ofCampaign('ravenford')).map((record) => record.part)).toEqual([
      'chat',
      'dice',
    ]);
    expect(await store.ofCampaign('other-table')).toHaveLength(1);
    expect(store.all()).toHaveLength(4);
  });

  it('forgets a report thirty days after it was last seen', async () => {
    const store = new InMemoryClientErrorStore();
    await store.record(REPORT, at(0));
    await store.record({ ...REPORT, part: 'chat' }, at(CLIENT_ERROR_DAYS * DAY - 1));
    expect(await store.ofCampaign('ravenford')).toHaveLength(2);
    await store.record({ ...REPORT, part: 'rules' }, at(CLIENT_ERROR_DAYS * DAY + 1));
    expect((await store.ofCampaign('ravenford')).map((record) => record.part)).toEqual([
      'rules',
      'chat',
    ]);
  });

  it('holds a campaign’s list to its size: the longest unseen give way', async () => {
    const store = new InMemoryClientErrorStore();
    for (let index = 0; index < MAX_CLIENT_ERRORS + 3; index += 1) {
      await store.record({ ...REPORT, browserVersion: index }, at(index));
    }
    const list = await store.ofCampaign('ravenford');
    expect(list).toHaveLength(MAX_CLIENT_ERRORS);
    expect(list.at(-1)?.browserVersion).toBe(3);
    expect(MAX_UNPLACED_CLIENT_ERRORS).toBeGreaterThan(MAX_CLIENT_ERRORS);
  });

  it('is cleared a campaign at a time', async () => {
    const store = new InMemoryClientErrorStore();
    await store.record(REPORT, at(0));
    await store.record({ ...REPORT, campaignId: 'other-table' }, at(0));
    await store.clear('ravenford');
    expect(await store.ofCampaign('ravenford')).toEqual([]);
    expect(await store.ofCampaign('other-table')).toHaveLength(1);
  });
});
