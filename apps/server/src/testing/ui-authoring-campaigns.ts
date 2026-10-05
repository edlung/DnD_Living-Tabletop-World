import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import authoring from '../../../../tests/e2e/fixtures/authoring-campaigns.json' with { type: 'json' };
import dmTools from '../../../../tests/e2e/fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Every authoring and DM-tool journey owns an untouched Ravenford campaign cloned from the
 * authorized script through the engine. Proposals, commits, and undos are made
 * in the browser, through the real routes; nothing here pre-authors Tomas.
 */
export async function seedUiAuthoringCampaigns(engine: WorldEngine): Promise<void> {
  const seed = await loadRavenfordSeed();
  for (const campaignId of [...Object.values(authoring), ...Object.values(dmTools)]) {
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI authoring ${campaignId} seed failed`);
    }
  }
}
