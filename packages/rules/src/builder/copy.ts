import type { CharacterSheet } from '@ltw/contracts';

import { longRest } from '../rest.ts';

/**
 * A character brought from another campaign (docs/FULL_GAME_PLAN.md decision 15; docs/adr/0056-
 * characters-from-the-srd.md §5): its sheet only, fresh as after a long rest — all its hit points,
 * slots and uses — with no condition, Exhaustion, ordeal, contagion, Concentration, inspiration or
 * time of the other campaign; its levels, choices, experience and what it knows stay.
 */
export function copiedSheet(sheet: CharacterSheet): CharacterSheet {
  const rested: Partial<CharacterSheet> & CharacterSheet = { ...longRest(sheet) };
  delete rested.exhaustion;
  delete rested.ordeal;
  delete rested.lastLongRestAt;
  delete rested.contagions;
  delete rested.heroicInspiration;
  delete rested.inspirationDie;
  delete rested.raging;
  return { ...rested, conditions: [], concentration: null };
}
