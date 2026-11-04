import { describe, expect, it } from 'vitest';

import { COINAGES, coinageOf, coinsFor, splitWorth } from './coins.ts';

/** Coins shared with change made (docs/adr/0057-encounters-maps-loot.md §7). */
const [RAVENFORD = [], SRD = []] = COINAGES;

describe('coins shared with change made', () => {
  it('pays a worth in the fewest coins, largest first, never in electrum', () => {
    expect(coinsFor(RAVENFORD, 351)).toEqual([
      { catalogId: 'gold-crown', count: 3 },
      { catalogId: 'silver-mark', count: 5 },
      { catalogId: 'copper-penny', count: 1 },
    ]);
    // 1 PP = 10 GP = 20 EP = 100 SP = 1,000 CP (SRD 5.2.1).
    expect(coinsFor(SRD, 1_560)).toEqual([
      { catalogId: 'srd-platinum-piece', count: 1 },
      { catalogId: 'srd-gold-piece', count: 5 },
      { catalogId: 'srd-silver-piece', count: 6 },
    ]);
    expect(coinsFor(SRD, 0)).toEqual([]);
  });

  it('splits a worth evenly, what does not divide left over', () => {
    expect(splitWorth(1_051, 3)).toEqual({ shareCp: 350, restCp: 1 });
    expect(splitWorth(2, 3)).toEqual({ shareCp: 0, restCp: 2 });
    expect(coinageOf('srd-electrum-piece')).toBe(SRD);
    expect(coinageOf('watchman-mail')).toBeUndefined();
  });
});
