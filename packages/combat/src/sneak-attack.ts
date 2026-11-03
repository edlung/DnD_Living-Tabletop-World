import type { CombatantRecord, EncounterState, WorldState } from '@ltw/domain';
import { WEAPONS, sneakAttackDice } from '@ltw/rules';

import { gapBetween, isAlive } from './battlefield.ts';
import { incapacitated, vitalsOf, type Vitals } from './vitals.ts';
import type { WeaponView } from './weapon-view.ts';

/**
 * Sneak Attack (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4): once a turn, a Rogue's
 * extra d6s on a hit with a Finesse or a Ranged weapon, when it has Advantage on the roll, or when
 * an ally of its stands within 5 ft of the target, not Incapacitated, and it has no Disadvantage.
 * The once is its own turn's: an opportunity attack on another's turn counts against it.
 */
export function sneakDice(
  state: WorldState,
  encounter: EncounterState,
  attacker: CombatantRecord,
  attackerVitals: Vitals,
  target: CombatantRecord,
  weapon: WeaponView,
  tilt: { readonly advantage: boolean; readonly disadvantage: boolean },
): number {
  if (attackerVitals.kind !== 'character' || attacker.turn.sneakAttacked === true) return 0;
  const dice = sneakAttackDice(attackerVitals.sheet);
  if (dice === 0 || weapon.weaponId === null) return 0;
  const definition = WEAPONS[weapon.weaponId];
  if (!definition.ranged && !definition.properties.includes('finesse')) return 0;
  if (tilt.disadvantage) return 0;
  if (tilt.advantage) return dice;
  const ally = encounter.combatants.some((one) => {
    if (one.entityId === attacker.entityId || one.entityId === target.entityId) return false;
    if (one.side !== attacker.side || !isAlive(state, one.entityId)) return false;
    const vitals = vitalsOf(state, one.entityId);
    return vitals !== null && !incapacitated(vitals) && gapBetween(state, one, target) <= 5;
  });
  return ally ? dice : 0;
}
