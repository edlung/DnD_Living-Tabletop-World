import type { WorldEngine } from '@ltw/domain';

import type { AssetContentStore } from '../assets/content-store.ts';
import { importCuratedSet } from '../images/curated-import.ts';
import { loadCuratedSet } from '../images/curated-set.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { UI_PARTY_CAMPAIGNS } from './ui-party-campaigns.ts';
import { UI_RU_CAMPAIGNS, UI_RU_COMBAT } from './ui-ru-campaigns.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/**
 * Browser-test campaigns that show the curated Ravenford pictures (docs/adr/0035-images.md §3):
 * the read-only baselines (`ravenford`, the open-window `ui-combat`) and every Russian campaign,
 * imported the way `seed:ravenford` imports them, through real commands approved by the DM. Every
 * other journey keeps its campaign without images, so the neutral fallback stays covered.
 */
export const UI_IMAGE_CAMPAIGNS: readonly string[] = [
  'ravenford',
  'ui-combat',
  // The DM's own battle map over the curated one (Stage 670b).
  UI_PARTY_CAMPAIGNS.battleMap,
  ...Object.values(UI_RU_CAMPAIGNS),
  UI_RU_COMBAT,
];

export async function seedUiCuratedImages(
  engine: WorldEngine,
  contents: AssetContentStore,
): Promise<void> {
  const set = await loadCuratedSet();
  const logger = createLogger({ service: 'ui-images', level: 'silent' });
  for (const campaignId of UI_IMAGE_CAMPAIGNS) {
    await importCuratedSet({ engine, contents, set, logger }, campaignId, DM);
  }
}
