import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Browser-test campaigns for the table's dice (Stage 510): copies of Ravenford, one per journey,
 * so each one's roll log and the DM's requests are its own.
 */
export const UI_DICE_CAMPAIGNS = {
  roll: 'ui-dice-roll',
  /** A check from the sheet: its own table, so no other journey's roll queues before it. */
  sheet: 'ui-dice-sheet',
  ask: 'ui-dice-ask',
  ru: 'ui-dice-ru',
  /** Read-only: only looked at, at three widths. */
  axe: 'ui-dice-axe',
  still: 'ui-dice-still',
  /** The browser has no WebGL here: the plate alone tells the numbers (Stage 540). */
  plain: 'ui-dice-plain',
  /** A check rolled again with Heroic Inspiration (ADR 0046 §6). */
  reroll: 'ui-dice-reroll',
} as const;

export async function seedUiDiceCampaigns(engine: WorldEngine): Promise<void> {
  for (const [campaignId, language] of [
    [UI_DICE_CAMPAIGNS.roll, 'en'],
    [UI_DICE_CAMPAIGNS.sheet, 'en'],
    [UI_DICE_CAMPAIGNS.ask, 'en'],
    [UI_DICE_CAMPAIGNS.ru, 'ru'],
    [UI_DICE_CAMPAIGNS.axe, 'en'],
    [UI_DICE_CAMPAIGNS.still, 'en'],
    [UI_DICE_CAMPAIGNS.plain, 'en'],
    [UI_DICE_CAMPAIGNS.reroll, 'en'],
  ] as const) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI dice ${campaignId} seed failed`);
    }
  }
}
