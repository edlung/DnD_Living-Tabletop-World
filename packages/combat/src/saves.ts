import type { Ability } from '@ltw/contracts';
import type { Dice, DraftEvent } from '@ltw/domain';
import { COVER_BONUS, d20Test, saveEffects } from '@ltw/rules';

import { conditionsOf, exhaustionOf, saveModifier, type Vitals } from './vitals.ts';

/**
 * A saving throw against a spell, Counterspell or a condition's own save (SRD 5.2.1; docs/adr/
 * 0045-conditions-and-actions.md §1–3): cover adds to Dexterity saves; Paralyzed, Petrified,
 * Stunned and Unconscious fail Strength and Dexterity saves outright (no roll is recorded);
 * Restrained gives Disadvantage on Dexterity saves; Exhaustion takes 2 per level.
 */
export function spellSave(
  dice: Dice,
  target: Vitals,
  ability: Ability,
  dc: number,
  cover: 'half' | 'three-quarters' | 'none',
  purpose: 'spell' | 'counterspell' | 'condition' = 'spell',
  /** It Dodges (docs/adr/0045-conditions-and-actions.md §5): Advantage on Dexterity saves. */
  dodging = false,
): { success: boolean; event: DraftEvent } {
  const effects = saveEffects(ability, conditionsOf(target), exhaustionOf(target));
  const bonus = ability === 'dex' && cover !== 'none' ? COVER_BONUS[cover] : 0;
  const modifier = saveModifier(target, ability) + bonus + effects.penalty;
  const save = effects.autoFail
    ? { rolls: [] as number[], total: modifier, success: false }
    : d20Test(dice, {
        modifier,
        target: dc,
        advantage: effects.advantage || (dodging && ability === 'dex'),
        disadvantage: effects.disadvantage,
      });
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
        purpose,
      },
    },
  };
}
