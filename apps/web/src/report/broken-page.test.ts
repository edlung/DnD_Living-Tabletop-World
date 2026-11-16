import { describe, expect, it } from 'vitest';

import { maySelfReload } from './broken-page.tsx';

/** A table display that broke loads itself again (docs/adr/0073-table-ideas.md §1) — not for ever. */
describe('a screen that reloads itself', () => {
  const NOW = 1_800_000_000_000;
  it('may, the first times', () => {
    expect(maySelfReload(null, NOW)).toBe(String(NOW));
    expect(maySelfReload(String(NOW - 60_000), NOW)).toBe(`${String(NOW - 60_000)},${String(NOW)}`);
  });

  it('stops after three within ten minutes, and may again later', () => {
    const three = [NOW - 3 * 60_000, NOW - 2 * 60_000, NOW - 60_000].join(',');
    expect(maySelfReload(three, NOW)).toBeNull();
    expect(maySelfReload(three, NOW + 9 * 60_000)).not.toBeNull();
  });

  it('reads nothing into what it did not write', () => {
    expect(maySelfReload('not,a,time', NOW)).toBe(String(NOW));
  });
});
