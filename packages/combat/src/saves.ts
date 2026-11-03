import type { Ability } from '@ltw/contracts';
import type { Dice, DraftEvent } from '@ltw/domain';
import { COVER_BONUS, d20Test, rageAdvantage, saveEffects } from '@ltw/rules';

import { isObject } from './objects.ts';
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
  purpose:
    | 'spell'
    | 'counterspell'
    | 'condition'
    | 'topple'
    | 'grapple'
    | 'shove'
    | 'saddle'
    | 'hazard'
    | 'creature-action' = 'spell',
  /** It Dodges (docs/adr/0045-conditions-and-actions.md §5): Advantage on Dexterity saves. */
  dodging = false,
  /** It squeezes (docs/adr/0049-space-and-movement.md §4): Disadvantage on Dexterity saves. */
  squeezed = false,
  /** Heat in Medium or Heavy armor (docs/adr/0050-the-world-around.md §8): Disadvantage. */
  hampered = false,
): { success: boolean; event: DraftEvent } {
  const effects = saveEffects(ability, conditionsOf(target), exhaustionOf(target));
  const bonus = ability === 'dex' && cover !== 'none' ? COVER_BONUS[cover] : 0;
  const modifier = saveModifier(target, ability) + bonus + effects.penalty;
  // An object has no ability scores: it fails every save (docs/adr/0048-hit-points.md §5).
  const save =
    effects.autoFail || isObject(target)
      ? { rolls: [] as number[], total: modifier, success: false }
      : d20Test(dice, {
          modifier,
          target: dc,
          // Magic Resistance (docs/adr/0053-monsters-as-data.md §4): Advantage against spells.
          advantage:
            effects.advantage ||
            (dodging && ability === 'dex') ||
            // A Rage's Advantage on Strength saves (docs/adr/0056-characters-from-the-srd.md §4).
            (target.kind === 'character' && rageAdvantage(target.sheet, ability)) ||
            ((purpose === 'spell' || purpose === 'counterspell') &&
              target.kind === 'creature' &&
              target.block.traits?.magicResistance === true),
          disadvantage: effects.disadvantage || (squeezed && ability === 'dex') || hampered,
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
