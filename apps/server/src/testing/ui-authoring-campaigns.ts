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
  // The AI feedback journey switches the DM's "speaking with" character mid-reply: a second
  // character at Market Square, created by a real DM command. Elowen meets him unnamed, so his ID
  // is opaque (ADR 0008, Gate 06 remediation).
  const result = await engine.execute({
    commandId: `${dmTools.aiFeedback}.second-character`,
    campaignId: dmTools.aiFeedback,
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    command: {
      type: 'CreateEntity',
      entityId: 'character-7beabb40',
      kind: 'character',
      name: 'Bram Holt',
      description: 'A second traveller, for the AI feedback journey.',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    },
  });
  if (result.status !== 'accepted') throw new Error('UI AI feedback character seed failed');
}
