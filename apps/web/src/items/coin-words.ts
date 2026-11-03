import { COINAGES, coinsFor, type CoinCount } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * Coins in words, as the purse writes them (docs/adr/0057-encounters-maps-loot.md §7–8): "5 cr",
 * "12 gp"; a worth in the fewest coins of a coinage, largest first.
 */
const AMOUNTS: Readonly<Record<string, string>> = {
  'gold-crown': '{count} cr',
  'silver-mark': '{count} m',
  'copper-penny': '{count} p',
  'srd-platinum-piece': '{count} pp',
  'srd-gold-piece': '{count} gp',
  'srd-electrum-piece': '{count} ep',
  'srd-silver-piece': '{count} sp',
  'srd-copper-piece': '{count} cp',
};

export const coinWords = (t: Translate, counts: readonly CoinCount[]): string =>
  counts.map((one) => t(AMOUNTS[one.catalogId] ?? '{count}', { count: one.count })).join(' · ');

/** A worth in copper, in the coins of the coinage at `index` in `COINAGES`. */
export const worthIn = (t: Translate, worthCp: number, index: number): string =>
  coinWords(t, coinsFor(COINAGES[index] ?? COINAGES[0] ?? [], worthCp));
