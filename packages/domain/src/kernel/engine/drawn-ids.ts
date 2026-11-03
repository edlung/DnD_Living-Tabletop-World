import { CREATE_CHARACTER_IDS } from '../../character/limits.ts';
import { MAX_RESOLVED_IDS } from '../../combat/reactions.ts';
import { SPLIT_COINS_IDS } from '../../items/coins.ts';
import { DOWNTIME_IDS } from '../../items/crafting.ts';

/**
 * The IDs a command draws beyond a player's pool: a new character's records
 * (docs/adr/0056-characters-from-the-srd.md §2), coins shared out and the things the DM's downtime
 * finishes (docs/adr/0057-encounters-maps-loot.md §7, §9). A stored command holds at most the most.
 */
export { CREATE_CHARACTER_IDS, DOWNTIME_IDS, SPLIT_COINS_IDS };

export const MAX_DRAWN_IDS = Math.max(
  MAX_RESOLVED_IDS,
  CREATE_CHARACTER_IDS,
  SPLIT_COINS_IDS,
  DOWNTIME_IDS,
);
