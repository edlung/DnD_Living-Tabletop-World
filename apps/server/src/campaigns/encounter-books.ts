import { preparedEncounterSchema, type PreparedEncounter } from '@ltw/contracts';

import { initialScenarioDigest } from '../workshop/activation/digests.ts';
import type { CampaignInitialContentStore } from './content.ts';

export interface CampaignEncounterBooks {
  get(campaignId: string, expectedDigest: string): Promise<readonly PreparedEncounter[] | null>;
}

/** Owner-only adapter. Read frozen content only after route membership/DM authorization. */
export function createCampaignEncounterBooks(
  contents: CampaignInitialContentStore,
): CampaignEncounterBooks {
  return {
    get: async (campaignId, expectedDigest) => {
      const content = await contents.get(campaignId);
      if (
        !content ||
        content.campaignId !== campaignId ||
        content.scenarioDigest !== expectedDigest ||
        initialScenarioDigest(content.scenario) !== expectedDigest
      )
        return null;
      const { identities, content: scenario } = content.scenario;
      return scenario.encounters.flatMap((encounter, index) => {
        // This shortcut starts party-versus-hostile encounters only. Mixed-side scenarios
        // remain available in the scenario book and the normal manual combat tools.
        if (encounter.combatants.some((c) => c.side !== 'party' && c.side !== 'hostile')) return [];
        const parsed = preparedEncounterSchema.safeParse({
          encounterId: `scenario-${index + 1}`,
          title: encounter.title,
          summary: encounter.trigger.slice(0, 400),
          locationId: identities.entities[encounter.location],
          battlefield: encounter.battlefield,
          foes: encounter.combatants
            .filter((c) => c.side === 'hostile')
            .map((c) => ({ entityId: identities.entities[c.entity], position: c.position })),
          partyStart: encounter.combatants.filter((c) => c.side === 'party').map((c) => c.position),
        });
        return parsed.success ? [parsed.data] : [];
      });
    },
  };
}
