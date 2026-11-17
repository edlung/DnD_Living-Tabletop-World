import { describe, expect, it } from 'vitest';

import { newestAt } from './trouble-seen.ts';

/** What the DM's notice compares (docs/adr/0073-table-ideas.md §1): the newest report's time. */
describe('the newest report', () => {
  it('is the latest time among them, or none', () => {
    expect(newestAt([])).toBeNull();
    expect(
      newestAt([
        { lastAt: '2026-11-16T18:00:00.000Z' },
        { lastAt: '2026-11-16T19:30:00.000Z' },
        { lastAt: '2026-11-15T23:59:59.000Z' },
      ]),
    ).toBe('2026-11-16T19:30:00.000Z');
  });
});
