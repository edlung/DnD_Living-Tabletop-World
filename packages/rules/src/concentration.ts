import type { CharacterSheet } from '@ltw/contracts';

import { savingThrowModifier } from './character-math.ts';
import { incapacitatedBy } from './conditions.ts';
import { d20Test, type D20Result } from './d20.ts';
import type { Dice } from './dice.ts';

/**
 * Concentration (SRD 5.2.1 Rules Glossary). Damage forces a Constitution
 * save with DC = max(10, floor(damage / 2)), capped at 30. Incapacitation or
 * death ends it; starting another Concentration effect replaces it.
 */
export function concentrationSaveDc(damage: number): number {
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

export type ConcentrationOutcome =
  | { readonly required: false }
  | {
      readonly required: true;
      readonly dc: number;
      readonly save: D20Result;
      readonly maintained: boolean;
    };

export function checkConcentrationAfterDamage(
  dice: Dice,
  sheet: CharacterSheet,
  damage: number,
): ConcentrationOutcome {
  if (sheet.concentration === null || damage <= 0) return { required: false };
  const dc = concentrationSaveDc(damage);
  const save = d20Test(dice, { modifier: savingThrowModifier(sheet, 'con'), target: dc });
  return { required: true, dc, save, maintained: save.success };
}

/** Concentration that survives the sheet's current conditions and HP (ADR 0045 §1). */
export function concentrationAfterConditions(
  sheet: CharacterSheet,
): CharacterSheet['concentration'] {
  if (incapacitatedBy(sheet.conditions) || sheet.hitPoints.current === 0) return null;
  return sheet.concentration;
}
