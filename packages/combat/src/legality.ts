import type { CoverLevel, Damage, SpellId, Square } from '@ltw/contracts';
import {
  combatantOf,
  wieldedWeapons,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  COVER_BONUS,
  FIREBALL_RADIUS_FT,
  SPELLS,
  WEAPONS,
  attackCircumstances,
  beginAttackAction,
  exhaustionPenalty,
  moveRequiredFt,
  squareDistanceFt,
  withinArea,
  type Illegal,
  type IllegalReason,
  type TurnState,
  weaponAttackBonus,
  weaponModifier,
} from '@ltw/rules';

import { coverAt, isAlive, turnStateOf } from './battlefield.ts';
import { charmedBy, conditionsAgainst } from './condition-details.ts';
import {
  armorClass,
  conditionsOf,
  exhaustionOf,
  incapacitated,
  vitalsOf,
  type Vitals,
} from './vitals.ts';

/**
 * Attack legality (docs/adr/0015-combat-engine.md §3), shared by the combat
 * decisions and the Context Engine so both apply one rule. The Rules Engine
 * decides every mechanic; this module only gathers its inputs from the
 * encounter.
 */
export type CombatReason =
  | IllegalReason
  | 'NOT_IN_COMBAT'
  | 'NOT_A_COMBATANT'
  | 'ACTOR_DEAD'
  | 'TARGET_DEAD'
  | 'TARGET_IN_COMBAT';
export type Refusal = {
  readonly legal: false;
  readonly reason: CombatReason;
  readonly resolution?: Illegal['resolution'];
};
const refuse = (reason: CombatReason, resolution?: Illegal['resolution']): Refusal =>
  resolution ? { legal: false, reason, resolution } : { legal: false, reason };

export interface AttackPlan {
  readonly legal: true;
  readonly attacker: CombatantRecord;
  readonly target: CombatantRecord;
  readonly attackerVitals: Vitals;
  readonly targetVitals: Vitals;
  /** The attacker's turn after this attack begins (the Attack action is taken on the first attack). */
  readonly turn: TurnState;
  readonly bonus: number;
  readonly targetAc: number;
  readonly cover: Exclude<CoverLevel, 'total'> | 'none';
  readonly distanceFt: number;
  readonly longRange: boolean;
  readonly advantage: boolean;
  readonly disadvantage: boolean;
  readonly criticalOnHit: boolean;
  readonly damage: Damage;
  readonly advantageDamage: Damage | null;
  readonly slow: boolean;
  readonly huntersMark: boolean;
}

export function attackPlan(
  state: WorldState,
  encounter: EncounterState,
  attackerId: string,
  attackId: string,
  targetId: string,
): AttackPlan | Refusal {
  const attacker = combatantOf(encounter, attackerId);
  const target = combatantOf(encounter, targetId);
  if (!attacker) return refuse('NOT_IN_COMBAT');
  if (!target) return refuse('NOT_A_COMBATANT');
  const attackerVitals = vitalsOf(state, attackerId);
  const targetVitals = vitalsOf(state, targetId);
  if (!attackerVitals || !targetVitals) return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, attackerId)) return refuse('ACTOR_DEAD');
  if (attackerId === targetId) return refuse('TARGET_REQUIRED');
  if (!isAlive(state, targetId)) return refuse('TARGET_DEAD');
  if (incapacitated(attackerVitals)) return refuse('INCAPACITATED');
  // A Charmed creature cannot attack its charmer (docs/adr/0045-conditions-and-actions.md §1).
  if (charmedBy(attacker, attackerVitals, targetId)) return refuse('CHARMED_BY_TARGET');

  let turn = turnStateOf(encounter, attacker);
  if (!turn.ownTurn) return refuse('NOT_YOUR_TURN');
  if (turn.attacksRemaining === 0) {
    if (attackerVitals.kind === 'character') {
      const begun = beginAttackAction(attackerVitals.sheet, turn);
      if ('legal' in begun) return refuse(begun.reason);
      turn = begun;
    } else {
      if (turn.actionUsed) return refuse('NO_ACTION');
      turn = { ...turn, actionUsed: true, attacksRemaining: attackerVitals.block.attacksPerAction };
    }
  }

  const distanceFt = squareDistanceFt(attacker.position, target.position);
  const coverLevel = coverAt(encounter, target.position);
  if (coverLevel === 'total') return refuse('TOTAL_COVER');
  const weapon = weaponOf(state, attackerVitals, attackId);
  if (!weapon) return refuse('NO_WEAPON');
  const limit = weapon.melee ? weapon.reachFt : weapon.longRangeFt;
  if (distanceFt > limit)
    return refuse('OUT_OF_RANGE', { moveRequiredFt: moveRequiredFt(distanceFt, limit) });
  const longRange = !weapon.melee && distanceFt > weapon.normalRangeFt;
  const circumstances = attackCircumstances({
    attackerConditions: conditionsAgainst(state, encounter, attacker, attackerVitals, targetId),
    targetConditions: conditionsOf(targetVitals),
    melee: weapon.melee,
    distanceFt,
    longRange,
  });
  const marked =
    attackerVitals.kind === 'character' &&
    attackerVitals.sheet.concentration?.spellId === 'hunters-mark' &&
    attackerVitals.sheet.concentration.targetId === targetId;
  return {
    legal: true,
    attacker,
    target,
    attackerVitals,
    targetVitals,
    turn,
    // Exhaustion takes 2 per level from the attack roll (ADR 0045 §3).
    bonus: weapon.bonus + exhaustionPenalty(exhaustionOf(attackerVitals)),
    targetAc: armorClass(targetVitals) + (coverLevel === 'none' ? 0 : COVER_BONUS[coverLevel]),
    cover: coverLevel,
    distanceFt,
    longRange,
    ...circumstances,
    damage: weapon.damage,
    advantageDamage: weapon.advantageDamage,
    slow: weapon.slow,
    huntersMark: marked,
  };
}

interface WeaponView {
  readonly melee: boolean;
  readonly reachFt: number;
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly bonus: number;
  readonly damage: Damage;
  readonly advantageDamage: Damage | null;
  readonly slow: boolean;
}

function weaponOf(state: WorldState, v: Vitals, attackId: string): WeaponView | null {
  if (v.kind === 'character') {
    // The sheet's weapons, and the weapon items the character wields (Stage 520).
    const weapon = [...v.sheet.weapons, ...wieldedWeapons(state, v.entityId)].find(
      (id) => id === attackId,
    );
    if (!weapon) return null;
    const definition = WEAPONS[weapon];
    const modifier = weaponModifier(v.sheet, weapon);
    return {
      melee: !definition.ranged,
      reachFt: 5,
      normalRangeFt: definition.normalRangeFt,
      longRangeFt: definition.longRangeFt,
      bonus: weaponAttackBonus(v.sheet, weapon),
      damage: {
        ...definition.damageDice,
        sides: definition.damageDice.sides as Damage['sides'],
        bonus: modifier,
        type: definition.damageType,
      },
      advantageDamage: null,
      slow: definition.mastery === 'slow',
    };
  }
  const attack = v.block.attacks.find((a) => a.attackId === attackId);
  if (!attack) return null;
  return {
    melee: attack.kind === 'melee',
    reachFt: attack.reachFt ?? 5,
    normalRangeFt: attack.normalRangeFt ?? 0,
    longRangeFt: attack.longRangeFt ?? 0,
    bonus: attack.bonus,
    damage: attack.damage,
    advantageDamage: attack.advantageDamage ?? null,
    slow: false,
  };
}

/** Combatants a Fireball centered on `point` would affect: everyone within 20 ft, allies included, unless in total cover. */
export function fireballArea(
  state: WorldState,
  encounter: EncounterState,
  point: Square,
): CombatantRecord[] {
  return encounter.combatants.filter(
    (c) =>
      isAlive(state, c.entityId) &&
      withinArea(point, c.position, FIREBALL_RADIUS_FT) &&
      coverAt(encounter, c.position) !== 'total',
  );
}

export const isSliceSpell = (spellId: string): spellId is SpellId => spellId in SPELLS;
