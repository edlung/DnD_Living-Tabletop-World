import { buildPackage as buildCollection } from '../campaign-collection/package.ts';
import {
  COLLECTION_ROOT,
  SLUGS as COLLECTION_SLUGS,
  loadSource as loadCollection,
} from '../campaign-collection/source.ts';
import { buildPackage as buildDark } from '../dark-fantasy/package.ts';
import {
  COLLECTION_ROOT as DARK_ROOT,
  SLUGS as DARK_SLUGS,
  loadSource as loadDark,
} from '../dark-fantasy/source.ts';
import { buildPackage as buildFantasy } from '../fantasy-campaigns/package.ts';
import {
  COLLECTION_ROOT as FANTASY_ROOT,
  SLUGS as FANTASY_SLUGS,
  loadSource as loadFantasy,
} from '../fantasy-campaigns/source.ts';
import { buildPackage as buildNoir } from '../noir-campaigns/package.ts';
import {
  COLLECTION_ROOT as NOIR_ROOT,
  SLUGS as NOIR_SLUGS,
  loadSource as loadNoir,
} from '../noir-campaigns/source.ts';
import type { ArtSeries } from './curated-art.ts';

/**
 * Authored series whose campaigns can be reworked with pictures and Sonnet text. Entry points
 * (`import-art.ts`, `sonnet-write.ts`, the art test) take `<series>/<slug>`, e.g.
 * `fantasy-2026/mountain-wedding`. Add a series here once its tools load `items.json`.
 */
export interface Series extends ArtSeries {
  /** Folder under `campaigns/`. */
  name: string;
  /** Folder under `scripts/` with the series `CONTENT_CONTRACT.md`. */
  tool: string;
  slugs: readonly string[];
}

export const SERIES: readonly Series[] = [
  {
    name: 'collection-2026',
    tool: 'campaign-collection',
    root: COLLECTION_ROOT,
    slugs: COLLECTION_SLUGS,
    loadSource: loadCollection,
    buildPackage: (s, size) =>
      buildCollection(s as Awaited<ReturnType<typeof loadCollection>>, size),
  },
  {
    name: 'fantasy-2026',
    tool: 'fantasy-campaigns',
    root: FANTASY_ROOT,
    slugs: FANTASY_SLUGS,
    loadSource: loadFantasy,
    buildPackage: (s, size) => buildFantasy(s as Awaited<ReturnType<typeof loadFantasy>>, size),
  },
  {
    name: 'dark-fantasy-2026',
    tool: 'dark-fantasy',
    root: DARK_ROOT,
    slugs: DARK_SLUGS,
    loadSource: loadDark,
    buildPackage: (s, size) => buildDark(s as Awaited<ReturnType<typeof loadDark>>, size),
  },
  {
    name: 'noir-2026',
    tool: 'noir-campaigns',
    root: NOIR_ROOT,
    slugs: NOIR_SLUGS,
    loadSource: loadNoir,
    buildPackage: (s, size) => buildNoir(s as Awaited<ReturnType<typeof loadNoir>>, size),
  },
];

/** `collection-2026/sky-archipelago` → its series and slug. */
export function campaignOf(id: string): { series: Series; slug: string } {
  const [name, slug] = id.split('/');
  const series = SERIES.find((x) => x.name === name);
  if (!series || !slug || !series.slugs.includes(slug))
    throw new Error(`Unknown campaign ${id}; expected <series>/<slug>`);
  return { series, slug };
}
