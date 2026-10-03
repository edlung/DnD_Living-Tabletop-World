import type { CharacterSheet, Skill } from '@ltw/contracts';

import { skillModifier } from './character-math.ts';
import type { Dice } from './dice.ts';

/**
 * Adapter for the World Engine's skill-check port (docs/adr/0013-investigation.md,
 * technical notes): the d20 comes from the injected `Dice`, the modifier
 * from these rules. Structurally matches `SkillCheckPort` in @ltw/domain.
 */
export function skillCheckPort(dice: Dice): {
  rollD20(): number;
  skillModifier(sheet: CharacterSheet, skill: Skill): number;
} {
  return {
    rollD20: () => dice.roll(20),
    skillModifier: (sheet, skill) => skillModifier(sheet, skill),
  };
}
