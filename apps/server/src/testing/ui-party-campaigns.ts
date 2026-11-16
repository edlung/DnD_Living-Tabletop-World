import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import {
  RAVENFORD_FIXTURES_DIR,
  RAVENFORD_RU_FIXTURES_DIR,
  RAVENFORD_SEED_FILES,
  loadSeed,
} from '../world-engine/ravenford-seed.ts';

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
  /** The viewer's ruler and spell's area on the board (Stage 670c). */
  boardTools: 'ui-board-tools',
  /** The table's shared marks on the board (Stage 670c). */
  marks: 'ui-marks',
  /** Traps and harmful ground on the board (Stage 670d). */
  traps: 'ui-traps',
  /** A trap noticed and disarmed (Stage 670d, part 2). */
  trapsFound: 'ui-traps-found',
  /** What a fallen foe carried, taken after the fight (Stage 670e). */
  lootFight: 'ui-loot-fight',
  /** The world map, its routes and a journey (Stage 670g): lands nobody has mapped yet. */
  travel: 'ui-travel',
  travelRu: 'ui-travel-ru',
  /** The DM's editors without AI (Stage 680a). */
  editors: 'ui-editors',
  editorsRu: 'ui-editors-ru',
  /** The DM's library: kept handouts and random tables (Stage 680b). */
  library: 'ui-library',
  libraryRu: 'ui-library-ru',
  /** An evening closed and the next opened with "Previously…" (Stage 710). */
  ritual: 'ui-ritual',
  /** The same journey on an iPad in WebKit, on a campaign of its own. */
  ritualIpad: 'ui-ritual-ipad',
  ritualRu: 'ui-ritual-ru',
  /** Stars and wishes at an evening's end (Stage 720). */
  stars: 'ui-stars',
  starsIpad: 'ui-stars-ipad',
  starsRu: 'ui-stars-ru',
  /** The next game's date (Stage 730). */
  nextGame: 'ui-next-game',
  nextGameIpad: 'ui-next-game-ipad',
  nextGameRu: 'ui-next-game-ru',
  /** The table's agreement and the DM's guide (Stage 740). */
  agreement: 'ui-agreement',
  agreementIpad: 'ui-agreement-ipad',
  agreementRu: 'ui-agreement-ru',
  /** The book of the campaign and its gallery (Stage 770). */
  book: 'ui-book',
  bookIpad: 'ui-book-ipad',
  bookRu: 'ui-book-ru',
  /** The same book with the curated pictures: the place, the faces, the gallery. */
  bookPictures: 'ui-book-pictures',
  /** A campaign finished, its keepsakes, and reopened (Stage 780). */
  ending: 'ui-ending',
  endingIpad: 'ui-ending-ipad',
  endingRu: 'ui-ending-ru',
  /** Small comforts: text size, a break, cheers (Stage 790). */
  comforts: 'ui-comforts',
  comfortsIpad: 'ui-comforts-ipad',
  comfortsRu: 'ui-comforts-ru',
  /** Client error reports: a screen that breaks, the DM's card (Stage 800). */
  troubles: 'ui-troubles',
  troublesIpad: 'ui-troubles-ipad',
  troublesRu: 'ui-troubles-ru',
  /** A short way to a pause, in Russian (Stage 810). */
  pauseRu: 'ui-pause-ru',
  /** The DM's card over an open sheet, on a phone (Stage 810). */
  pausePhone: 'ui-pause-phone',
  /** "What can I do?" outside a fight (Stage 820). */
  hintScene: 'ui-hint-scene',
  /** The party's encyclopedia, "What we know" (Stage 830). */
  known: 'ui-known',
  knownIpad: 'ui-known-ipad',
  knownRu: 'ui-known-ru',
} as const;

/**
 * The travel journeys start where no map exists and the DM draws the first one: their Ravenford is
 * seeded without the town's growth (`town-seed.json`), which brings the shipped map of the
 * surroundings, its pins and its roads.
 */
const UNMAPPED: readonly string[] = [UI_PARTY_CAMPAIGNS.travel, UI_PARTY_CAMPAIGNS.travelRu];
const BEFORE_THE_MAP = RAVENFORD_SEED_FILES.filter(({ prefix }) => prefix !== 'town');

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
    [UI_PARTY_CAMPAIGNS.boardTools, 'en'],
    [UI_PARTY_CAMPAIGNS.marks, 'en'],
    [UI_PARTY_CAMPAIGNS.traps, 'en'],
    [UI_PARTY_CAMPAIGNS.trapsFound, 'en'],
    [UI_PARTY_CAMPAIGNS.lootFight, 'en'],
    [UI_PARTY_CAMPAIGNS.travel, 'en'],
    [UI_PARTY_CAMPAIGNS.travelRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.editors, 'en'],
    [UI_PARTY_CAMPAIGNS.editorsRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.library, 'en'],
    [UI_PARTY_CAMPAIGNS.libraryRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.ritual, 'en'],
    [UI_PARTY_CAMPAIGNS.ritualIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.ritualRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.stars, 'en'],
    [UI_PARTY_CAMPAIGNS.starsIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.starsRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.nextGame, 'en'],
    [UI_PARTY_CAMPAIGNS.nextGameIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.nextGameRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.agreement, 'en'],
    [UI_PARTY_CAMPAIGNS.agreementIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.agreementRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.book, 'en'],
    [UI_PARTY_CAMPAIGNS.bookIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.bookRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.bookPictures, 'en'],
    [UI_PARTY_CAMPAIGNS.ending, 'en'],
    [UI_PARTY_CAMPAIGNS.endingIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.endingRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.comforts, 'en'],
    [UI_PARTY_CAMPAIGNS.comfortsIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.comfortsRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.troubles, 'en'],
    [UI_PARTY_CAMPAIGNS.troublesIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.troublesRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.pauseRu, 'ru'],
    [UI_PARTY_CAMPAIGNS.pausePhone, 'en'],
    [UI_PARTY_CAMPAIGNS.hintScene, 'en'],
    [UI_PARTY_CAMPAIGNS.known, 'en'],
    [UI_PARTY_CAMPAIGNS.knownIpad, 'en'],
    [UI_PARTY_CAMPAIGNS.knownRu, 'ru'],
  ] as const) {
    const seed = await loadSeed(
      language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : RAVENFORD_FIXTURES_DIR,
      UNMAPPED.includes(campaignId) ? BEFORE_THE_MAP : RAVENFORD_SEED_FILES,
    );
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
