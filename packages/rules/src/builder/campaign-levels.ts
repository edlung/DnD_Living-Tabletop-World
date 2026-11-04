import type { CharacterSheet, HitPointsAtLevel, LevelsBy } from '@ltw/contracts';

import { totalLevel } from '../character-math.ts';
import { experienceFor } from './level-up.ts';

/**
 * Levels under the campaign's options (docs/adr/0056-characters-from-the-srd.md §3): a level is
 * ready by its experience or, by milestone, only when the DM granted it; a level's hit points are
 * the player's choice, or the campaign's one way; a new character starts at the campaign's level.
 */
export function levelReady(sheet: CharacterSheet, levelsBy: LevelsBy): boolean {
  const next = totalLevel(sheet) + 1;
  if (next > 20) return false;
  if ((sheet.pendingLevels ?? 0) > 0) return true;
  return levelsBy === 'experience' && (sheet.experience ?? 0) >= experienceFor(next);
}

/** Whether the campaign lets a level's hit points be taken this way. */
export const hitPointsAllowed = (option: HitPointsAtLevel, chosen: 'fixed' | 'rolled'): boolean =>
  option === 'choice' || option === chosen;

/**
 * A new character at the campaign's starting level (SRD 5.2.1, Starting at Higher Levels): made at
 * level 1 with the experience its level needs, and the levels to take one by one with their
 * choices.
 */
export function startingAt(sheet: CharacterSheet, level: number): CharacterSheet {
  if (level <= 1) return sheet;
  return { ...sheet, experience: experienceFor(level), pendingLevels: level - 1 };
}
