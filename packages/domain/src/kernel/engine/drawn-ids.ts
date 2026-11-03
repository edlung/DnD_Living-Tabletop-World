import type { KernelCommand, KernelCommandOf, KernelCommandType } from '@ltw/contracts';

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

/**
 * The DM's commands that roll: damage that may call for a Concentration save, a joining creature's
 * initiative, a turn that passes on to a death save (docs/adr/0043-dm-screen.md §1–2), a flyer made
 * Prone that falls (docs/adr/0049-space-and-movement.md §6), the toolbox's saves and dice, and a
 * journey's saves of extended travel (docs/adr/0057-encounters-maps-loot.md §10).
 */
const DM_ROLLED = [
  'AdjustHitPoints',
  'SetCondition',
  'AddCombatant',
  'RemoveCombatant',
  'DelayTurn',
  'ExposeToHazard',
  'SpringTrap',
  'InflictMentalStress',
  'InfectWithContagion',
  'ContagionCourse',
  'UseCreatureAction',
  'DawnRecharge',
  'Travel',
] as const satisfies readonly KernelCommandType[];
const ROLLED: ReadonlySet<string> = new Set(DM_ROLLED);
export const isDmRolled = (
  command: KernelCommand,
): command is KernelCommandOf<(typeof DM_ROLLED)[number]> => ROLLED.has(command.type);

export const MAX_DRAWN_IDS = Math.max(
  MAX_RESOLVED_IDS,
  CREATE_CHARACTER_IDS,
  SPLIT_COINS_IDS,
  DOWNTIME_IDS,
);
