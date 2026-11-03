import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Browser-test campaigns for the rules reference (docs/adr/0055-rules-reference-and-toolbox.md
 * §2–3): Ravenford, in English and in Russian, with Elowen knocked Prone, so her card shows a
 * condition whose words open in place.
 */
export const UI_RULES_CAMPAIGNS = {
  en: 'ui-rules-en',
  ru: 'ui-rules-ru',
} as const;

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

export async function seedUiRulesCampaigns(engine: WorldEngine): Promise<void> {
  for (const [language, campaignId] of Object.entries(UI_RULES_CAMPAIGNS)) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI rules ${campaignId} seed failed`);
    }
    const prone = await engine.execute({
      campaignId,
      commandId: `${campaignId}.rules.prone`,
      actor: DM,
      command: {
        type: 'SetCondition',
        targetId: 'elowen-starwhisper',
        condition: 'prone',
        applied: true,
        reason: 'Tripped on the cobbles',
      },
    });
    if (prone.status !== 'accepted') throw new Error(`UI rules ${campaignId}: Prone failed`);
  }
}
