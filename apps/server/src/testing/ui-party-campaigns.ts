import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Browser-test campaigns for the table's party (Stage 605): copies of Ravenford whose four
 * characters — Elowen and her three companions — stand on the Old Trade Road, so the DM can
 * start the prepared ambush there; one journey each.
 */
export const UI_PARTY_CAMPAIGNS = {
  ambush: 'ui-party-ambush',
  ru: 'ui-party-ru',
  /** The DM's screen (Stage 620): the party panel, the DM's hand, the turn order, notes. */
  dmScreen: 'ui-dm-screen',
  /** The same journeys on an iPad in WebKit, on a campaign of their own. */
  dmScreenIpad: 'ui-dm-screen-ipad',
  /** The table's chat (Stage 630). */
  chat: 'ui-chat',
  /** The companion's alerts (Stage 630). */
  companion: 'ui-companion',
} as const;

const PARTY = ['elowen-starwhisper', 'brann-ironvale', 'tamsin-quickfoot', 'maren-ashby'];
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

export async function seedUiPartyCampaigns(engine: WorldEngine): Promise<void> {
  for (const [campaignId, language] of [
    [UI_PARTY_CAMPAIGNS.ambush, 'en'],
    [UI_PARTY_CAMPAIGNS.ru, 'ru'],
    [UI_PARTY_CAMPAIGNS.dmScreen, 'en'],
    [UI_PARTY_CAMPAIGNS.dmScreenIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.chat, 'en'],
    [UI_PARTY_CAMPAIGNS.companion, 'en'],
  ] as const) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI party ${campaignId} seed failed`);
    }
    for (const entityId of PARTY) {
      const moved = await engine.execute({
        campaignId,
        commandId: `${campaignId}.road.${entityId}`,
        actor: DM,
        command: { type: 'PlaceEntity', entityId, locationId: 'old-trade-road' },
      });
      if (moved.status !== 'accepted') throw new Error(`UI party ${campaignId} could not travel`);
    }
  }
}
