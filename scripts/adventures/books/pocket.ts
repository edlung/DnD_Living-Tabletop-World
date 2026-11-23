import { existsSync, readFileSync } from 'node:fs';

import type { CampaignBookPocket } from '../../../packages/contracts/src/index.ts';

/**
 * A built-in adventure's DM pocket, kept beside its pages (`ravenford-pocket.json`,
 * `hollowmere-pocket.json`; docs/CAMPAIGN_TEXT_STANDARD.md §7): `{ pocket }` for its book, or
 * nothing while the adventure has none.
 */
export function readPocket(adventure: 'ravenford' | 'hollowmere'): {
  pocket?: CampaignBookPocket;
} {
  const file = new URL(`${adventure}-pocket.json`, import.meta.url);
  return existsSync(file)
    ? { pocket: JSON.parse(readFileSync(file, 'utf8')) as CampaignBookPocket }
    : {};
}
