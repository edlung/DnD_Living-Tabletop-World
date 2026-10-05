import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

/** Browser-test campaigns in Russian (docs/adr/0031-play-language.md §9); each journey owns one. */
export const UI_RU_CAMPAIGNS = {
  player: 'ui-ru-player',
  dm: 'ui-ru-dm',
  chronicle: 'ui-ru-chronicle',
  time: 'ui-ru-time',
} as const;

/** The Russian campaign that waits at an open Counterspell window. */
export const UI_RU_COMBAT = 'ui-ru-combat';

/** The Russian Ravenford under fresh campaign IDs, seeded through real commands. */
export async function seedUiRussianCampaigns(engine: WorldEngine): Promise<void> {
  await seedCombatCampaign(engine, UI_RU_COMBAT, 'window', RAVENFORD_RU_FIXTURES_DIR);

  const seed = await loadRavenfordSeed(RAVENFORD_RU_FIXTURES_DIR);
  for (const campaignId of Object.values(UI_RU_CAMPAIGNS)) {
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') {
        throw new Error(
          `UI Russian ${campaignId} ${submission.command.type}: ${result.status === 'rejected' ? result.code : result.status}`,
        );
      }
    }
  }
}
