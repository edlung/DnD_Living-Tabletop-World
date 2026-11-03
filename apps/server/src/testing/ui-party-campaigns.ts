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
  /** The players' own dice and private rolls (Stage 630). */
  ownDice: 'ui-own-dice',
  /** Handouts (Stage 630). */
  handouts: 'ui-handouts',
  /** A creature a player commands (Stage 630). */
  commanded: 'ui-commanded',
  /** The conditions in a fight (Stage 640). */
  conditions: 'ui-conditions',
  /** The actions beside Attack and Magic (Stage 640). */
  actions: 'ui-actions',
  /** The DM's encounter builder and hand on the board (Stage 670). */
  encounters: 'ui-encounters',
  /** The DM's brush on a running fight's ground (Stage 670b). */
  terrain: 'ui-terrain',
  /** The DM's own battle map and its grid, with the curated pictures (Stage 670b). */
  battleMap: 'ui-battle-map',
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
    [UI_PARTY_CAMPAIGNS.ownDice, 'en'],
    [UI_PARTY_CAMPAIGNS.handouts, 'en'],
    [UI_PARTY_CAMPAIGNS.commanded, 'en'],
    [UI_PARTY_CAMPAIGNS.conditions, 'en'],
    [UI_PARTY_CAMPAIGNS.actions, 'en'],
    [UI_PARTY_CAMPAIGNS.encounters, 'en'],
    [UI_PARTY_CAMPAIGNS.terrain, 'en'],
    [UI_PARTY_CAMPAIGNS.battleMap, 'en'],
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
