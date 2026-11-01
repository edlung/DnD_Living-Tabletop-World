import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * The whole game in the browser (Stage 540, `tests/e2e/a-to-z.spec.ts`): a copy of Ravenford whose
 * Old Trade Road ambushers already wait on the road, so the DM can start the fight when the party
 * comes. Elowen starts in the market square, as in the slice.
 */
export const UI_A_TO_Z_CAMPAIGN = 'ui-a-to-z';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

export async function seedUiAToZCampaign(engine: WorldEngine): Promise<void> {
  const campaignId = UI_A_TO_Z_CAMPAIGN;
  for (const input of (await loadRavenfordSeed()).submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
    if (result.status !== 'accepted') throw new Error(`UI ${campaignId} seed failed`);
  }
  const ambushers = ambush.place.filter((command) => command.entityId !== 'elowen-starwhisper');
  for (const [index, command] of ambushers.entries()) {
    const result = await engine.execute({
      campaignId,
      commandId: `${campaignId}.ambushers.${String(index)}`,
      actor: DM,
      command,
    });
    if (result.status !== 'accepted') throw new Error(`UI ${campaignId} ambushers failed`);
  }
}
