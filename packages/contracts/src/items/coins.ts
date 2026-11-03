/**
 * Coins shared with change made (docs/adr/0057-encounters-maps-loot.md §7). A purse may hold two
 * coinages — Ravenford's crowns, marks and pennies, and the SRD's platinum, gold, electrum, silver
 * and copper (1 PP = 10 GP = 20 EP = 100 SP = 1,000 CP) — each counted in copper. Splitting pools
 * one coinage, gives every member the same worth in the largest coins (change is never made in
 * electrum), and what does not divide stays with the one who shared it.
 */
export interface Coin {
  readonly catalogId: string;
  readonly valueCp: number;
}
export interface CoinCount {
  readonly catalogId: string;
  readonly count: number;
}

export const COINAGES: readonly (readonly Coin[])[] = [
  [
    { catalogId: 'gold-crown', valueCp: 100 },
    { catalogId: 'silver-mark', valueCp: 10 },
    { catalogId: 'copper-penny', valueCp: 1 },
  ],
  [
    { catalogId: 'srd-platinum-piece', valueCp: 1000 },
    { catalogId: 'srd-gold-piece', valueCp: 100 },
    { catalogId: 'srd-electrum-piece', valueCp: 50 },
    { catalogId: 'srd-silver-piece', valueCp: 10 },
    { catalogId: 'srd-copper-piece', valueCp: 1 },
  ],
];

/** The coinage a coin belongs to, if it is a coin. */
export const coinageOf = (catalogId: string): readonly Coin[] | undefined =>
  COINAGES.find((coins) => coins.some((coin) => coin.catalogId === catalogId));

/** A worth as the fewest coins of a coinage, largest first; no electrum in change. */
export function coinsFor(coinage: readonly Coin[], worthCp: number): CoinCount[] {
  let left = worthCp;
  const counts: CoinCount[] = [];
  for (const coin of coinage) {
    if (coin.catalogId === 'srd-electrum-piece') continue;
    const count = Math.floor(left / coin.valueCp);
    if (count > 0) counts.push({ catalogId: coin.catalogId, count });
    left -= count * coin.valueCp;
  }
  return counts;
}

/** One coinage's worth split among `members`: each one's share, and what stays undivided. */
export function splitWorth(
  totalCp: number,
  members: number,
): { readonly shareCp: number; readonly restCp: number } {
  const shareCp = members > 0 ? Math.floor(totalCp / members) : 0;
  return { shareCp, restCp: totalCp - shareCp * members };
}
