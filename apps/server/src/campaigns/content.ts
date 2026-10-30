import type { CampaignBootstrapAsset, CampaignRevision, QuestDefinition } from '@ltw/contracts';

import type { StoredCampaignActivation } from '../workshop/activation/store.ts';

/** Immutable private scenario/definition manifests. Progress remains a history projection. */
export interface CampaignInitialContent {
  readonly campaignId: string;
  readonly activationId: string;
  readonly scenario: CampaignRevision;
  readonly quests: readonly QuestDefinition[];
  readonly assets: readonly CampaignBootstrapAsset[];
  readonly scenarioDigest: string;
  readonly questDigest: string;
  readonly manifestDigest: string;
  readonly planDigest: string;
}
export interface CampaignInitialContentStore {
  prepare(activation: StoredCampaignActivation): Promise<void>;
  get(campaignId: string): Promise<CampaignInitialContent | null>;
}
