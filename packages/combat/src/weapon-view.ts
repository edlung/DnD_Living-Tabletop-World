import type { AmmunitionKind, Damage, WeaponId, WeaponMastery } from '@ltw/contracts';
import { handsOf, wieldedWeapons, type WorldState } from '@ltw/domain';
import {
  WEAPONS,
  abilityModifier,
  masteryOf,
  proficiencyBonus,
  totalLevel,
  weaponAttackBonus,
  weaponModifier,
} from '@ltw/rules';

import type { Vitals } from './vitals.ts';

/** An attack's damage dice; an Unarmed Strike rolls none (`count` 0: 1 + Strength). */
export interface AttackDamage {
  readonly count: number;
  readonly sides: Damage['sides'];
  readonly bonus: number;
  readonly type: string;
}

/** A character's Unarmed Strike (SRD 5.2.1): every character has one, with proficiency. */
export const UNARMED_STRIKE = 'unarmed-strike';

/**
 * An object at hand wielded as a weapon (SRD 5.2.1; docs/adr/0047-weapons.md §6): no Proficiency
 * Bonus, 1d4 Bludgeoning, thrown 20/60 at a target beyond 5 ft.
 */
export const IMPROVISED = 'improvised';

/**
 * An attack as its weapon makes it at a distance (docs/adr/0047-weapons.md §1, §7): a melee weapon
 * within its reach (10 ft with Reach), thrown beyond it when it has Thrown; a Versatile weapon in two
 * hands while nothing else is held; a Two-Handed one refused while a shield is; a Heavy one too
 * heavy for a weak wielder.
 */
export interface WeaponView {
  readonly melee: boolean;
  readonly reachFt: number;
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly bonus: number;
  readonly damage: AttackDamage;
  readonly advantageDamage: Damage | null;
  /** A stat block's added damage, each of its own type (docs/adr/0053-monsters-as-data.md §1). */
  readonly extraDamage: readonly Damage[];
  /** The character's weapon; null for a stat block's attack or an Unarmed Strike. */
  readonly weaponId: WeaponId | null;
  /** The ability modifier the attack uses: Graze's damage, Topple's DC. */
  readonly abilityModifier: number;
  /** The mastery the attacker uses with it; null when it has not mastered the weapon. */
  readonly mastery: WeaponMastery | null;
  readonly grip: 'two-handed' | null;
  readonly thrown: boolean;
  readonly tooHeavy: boolean;
  readonly light: boolean;
  readonly loading: boolean;
  /** The ammunition each shot spends. */
  readonly ammunition: AmmunitionKind | null;
}

export type WeaponRefusal = 'NO_WEAPON' | 'HANDS_FULL';

const plain = {
  advantageDamage: null,
  extraDamage: [],
  weaponId: null,
  mastery: null,
  grip: null,
  thrown: false,
  tooHeavy: false,
  light: false,
  loading: false,
  ammunition: null,
} as const;

export function weaponOf(
  state: WorldState,
  v: Vitals,
  attackId: string,
  distanceFt: number,
): WeaponView | WeaponRefusal {
  if (v.kind === 'character' && attackId === UNARMED_STRIKE) {
    const strength = abilityModifier(v.sheet.abilities.str);
    return {
      ...plain,
      melee: true,
      reachFt: 5,
      normalRangeFt: 0,
      longRangeFt: 0,
      bonus: strength + proficiencyBonus(totalLevel(v.sheet)),
      damage: { count: 0, sides: 4, bonus: 1 + strength, type: 'bludgeoning' },
      abilityModifier: strength,
    };
  }
  if (v.kind === 'character' && attackId === IMPROVISED) {
    const strength = abilityModifier(v.sheet.abilities.str);
    const thrown = distanceFt > 5;
    return {
      ...plain,
      melee: !thrown,
      reachFt: 5,
      normalRangeFt: thrown ? 20 : 0,
      longRangeFt: thrown ? 60 : 0,
      bonus: strength,
      damage: { count: 1, sides: 4, bonus: strength, type: 'bludgeoning' },
      abilityModifier: strength,
      thrown,
    };
  }
  if (v.kind === 'character') {
    // The sheet's weapons, and the weapon items the character wields (Stage 520).
    const weapon = [...v.sheet.weapons, ...wieldedWeapons(state, v.entityId)].find(
      (id) => id === attackId,
    );
    if (!weapon) return 'NO_WEAPON';
    const definition = WEAPONS[weapon];
    const has = (property: (typeof definition.properties)[number]) =>
      definition.properties.includes(property);
    const hands = handsOf(state, v.entityId);
    if (has('two-handed') && hands.shield) return 'HANDS_FULL';
    const reachFt = definition.ranged ? 0 : definition.normalRangeFt;
    const thrown =
      !definition.ranged && definition.thrownRange !== undefined && distanceFt > reachFt;
    const melee = !definition.ranged && !thrown;
    const range = thrown ? definition.thrownRange : undefined;
    const twoHands =
      melee && definition.versatileSides !== undefined && !hands.shield && hands.off === null;
    const modifier = weaponModifier(v.sheet, weapon);
    return {
      melee,
      reachFt,
      normalRangeFt: range?.normalFt ?? definition.normalRangeFt,
      longRangeFt: range?.longFt ?? definition.longRangeFt,
      bonus: weaponAttackBonus(v.sheet, weapon),
      extraDamage: [],
      damage: {
        count: definition.damageDice.count,
        sides: (twoHands
          ? definition.versatileSides
          : definition.damageDice.sides) as Damage['sides'],
        bonus: modifier + (definition.flatDamage ?? 0),
        type: definition.damageType,
      },
      advantageDamage: null,
      weaponId: weapon,
      abilityModifier: modifier,
      mastery: masteryOf(v.sheet, weapon),
      grip: twoHands ? 'two-handed' : null,
      thrown,
      tooHeavy: has('heavy') && (melee ? v.sheet.abilities.str < 13 : v.sheet.abilities.dex < 13),
      light: has('light'),
      loading: has('loading'),
      ammunition: definition.ammunition ?? null,
    };
  }
  const attack = v.block.attacks.find((a) => a.attackId === attackId);
  if (!attack) return 'NO_WEAPON';
  return {
    ...plain,
    melee: attack.kind === 'melee',
    reachFt: attack.reachFt ?? 5,
    normalRangeFt: attack.normalRangeFt ?? 0,
    longRangeFt: attack.longRangeFt ?? 0,
    bonus: attack.bonus,
    damage: attack.damage,
    advantageDamage: attack.advantageDamage ?? null,
    extraDamage: attack.extraDamage ?? [],
    abilityModifier: 0,
  };
}

/** A character's reach with its melee weapons, for the opportunity attacks it may make. */
export const reachOfWeapon = (weaponId: WeaponId): number =>
  WEAPONS[weaponId].ranged ? 0 : WEAPONS[weaponId].normalRangeFt;
