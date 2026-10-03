import type { Ability } from '@ltw/contracts';
import type { Dice, DraftEvent } from '@ltw/domain';
import { COVER_BONUS, d20Test } from '@ltw/rules';

import { has, saveModifier, type Vitals } from './vitals.ts';

/**
 * A spell's saving throw (SRD 5.2.1): cover adds to Dexterity saves; an
 * Unconscious creature automatically fails Strength and Dexterity saves
 * (no roll is recorded).
 */
export function spellSave(
  dice: Dice,
  target: Vitals,
  ability: Ability,
  dc: number,
  cover: 'half' | 'three-quarters' | 'none',
): { success: boolean; event: DraftEvent } {
  const bonus = ability === 'dex' && cover !== 'none' ? COVER_BONUS[cover] : 0;
  const modifier = saveModifier(target, ability) + bonus;
  const autoFail = (ability === 'dex' || ability === 'str') && has(target, 'unconscious');
  const save = autoFail
    ? { rolls: [] as number[], total: modifier, success: false }
    : d20Test(dice, { modifier, target: dc });
  return {
    success: save.success,
    event: {
      type: 'SavingThrowRolled',
      payload: {
        creatureId: target.entityId,
        ability,
        dc,
        rolls: [...save.rolls],
        modifier,
        total: save.total,
        success: save.success,
        purpose: 'spell',
      },
    },
  };
}
