import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Browser-test campaigns for rests and levels (Stage 530): copies of Ravenford, one per journey,
 * with Elowen hurt (30 of 78 hit points) and two spell slots spent, so a rest has work to do.
 */
export const UI_REST_CAMPAIGNS = {
  short: 'ui-rest-short',
  long: 'ui-rest-long',
  ru: 'ui-rest-ru',
  /** Read-only: only looked at, at three widths. */
  axe: 'ui-rest-axe',
  /** A result inside the character sheet, which must never hide its last lines (Stage 540). */
  notice: 'ui-rest-notice',
} as const;

const ELOWEN = 'elowen-starwhisper';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

export async function seedUiRestCampaigns(engine: WorldEngine): Promise<void> {
  for (const [campaignId, language] of [
    [UI_REST_CAMPAIGNS.short, 'en'],
    [UI_REST_CAMPAIGNS.long, 'en'],
    [UI_REST_CAMPAIGNS.ru, 'ru'],
    [UI_REST_CAMPAIGNS.axe, 'en'],
    [UI_REST_CAMPAIGNS.notice, 'en'],
  ] as const) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI rest ${campaignId} seed failed`);
    }
    const sheet = (await engine.load(campaignId))?.state.characterSheets.get(ELOWEN);
    if (!sheet) throw new Error(`UI rest ${campaignId} has no sheet for Elowen`);
    const hurt = await engine.execute({
      campaignId,
      commandId: `${campaignId}.hurt`,
      actor: DM,
      command: {
        type: 'SetCharacterSheet',
        entityId: ELOWEN,
        sheet: {
          ...sheet,
          hitPoints: { ...sheet.hitPoints, current: 30 },
          spellSlots: { ...sheet.spellSlots, expended: [1, 1, 0, 0, 0, 0, 0, 0, 0] },
        },
      },
    });
    if (hurt.status !== 'accepted') throw new Error(`UI rest ${campaignId} could not hurt Elowen`);
  }
}
