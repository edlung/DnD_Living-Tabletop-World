import type { QuestDefinition } from '@ltw/contracts';

import { initialQuestDigest } from '../workshop/activation/digests.ts';
import type { CampaignInitialContentStore } from './content.ts';

export interface CampaignQuestBooks {
  get(campaignId: string, expectedDigest: string): Promise<readonly QuestDefinition[] | null>;
}
/** Bounded immutable book cache. No package or private scenario is retained by this read adapter. */
export function createCampaignQuestBooks(
  contents: CampaignInitialContentStore,
): CampaignQuestBooks {
  const cached = new Map<string, readonly QuestDefinition[]>();
  return {
    get: async (campaignId, expectedDigest) => {
      const key = `${campaignId}/${expectedDigest}`;
      const prior = cached.get(key);
      if (prior) {
        cached.delete(key);
        cached.set(key, prior);
        return prior;
      }
      const content = await contents.get(campaignId);
      if (
        !content ||
        content.campaignId !== campaignId ||
        content.questDigest !== expectedDigest ||
        initialQuestDigest(content.quests) !== expectedDigest
      )
        return null;
      const quests = structuredClone(content.quests);
      cached.set(key, quests);
      if (cached.size > 32) {
        const oldest = cached.keys().next().value;
        if (oldest !== undefined) cached.delete(oldest);
      }
      return quests;
    },
  };
}
