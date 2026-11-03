import type { AmmunitionKind, Damage, StatBlock, WeaponId, WeaponMastery } from '@ltw/contracts';
import { handsOf, wieldedBonus, wieldedWeapons, type WorldState } from '@ltw/domain';
import {
  WEAPONS,
  abilityModifier,
  masteryOf,
  martialArtsDie,
  proficiencyBonus,
  rageDamage,
  totalLevel,
  usesStrength,
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
  // In Wild Shape's form, the form's attacks only (docs/adr/0056-characters-from-the-srd.md §5).
  if (v.kind === 'character' && v.form) return blockAttack(v.form, attackId);
  if (v.kind === 'character' && attackId === UNARMED_STRIKE) {
    const strength = abilityModifier(v.sheet.abilities.str);
    // Martial Arts: the Monk's die, and Dexterity where it is better (docs/adr/0056-…md §4).
    const art = martialArtsDie(v.sheet);
    const dexterity = abilityModifier(v.sheet.abilities.dex);
    const ability = art !== null ? Math.max(strength, dexterity) : strength;
    const rage = ability === strength ? rageDamage(v.sheet) : 0;
    return {
      ...plain,
      melee: true,
      reachFt: 5,
      normalRangeFt: 0,
      longRangeFt: 0,
      bonus: ability + proficiencyBonus(totalLevel(v.sheet)),
      damage:
        art !== null
          ? { count: 1, sides: art as Damage['sides'], bonus: ability + rage, type: 'bludgeoning' }
          : { count: 0, sides: 4, bonus: 1 + strength + rage, type: 'bludgeoning' },
      abilityModifier: ability,
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
      damage: { count: 1, sides: 4, bonus: strength + rageDamage(v.sheet), type: 'bludgeoning' },
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
    // A Monk weapon with Martial Arts: Dexterity where it is better, the Monk's die where it is
    // larger (Simple melee weapons and Martial melee ones with Light; docs/adr/0056-…md §4).
    const art = martialArtsDie(v.sheet);
    const monkWeapon =
      art !== null &&
      !definition.ranged &&
      (definition.category === 'simple' || definition.properties.includes('light'));
    const modifier = monkWeapon
      ? Math.max(abilityModifier(v.sheet.abilities.str), abilityModifier(v.sheet.abilities.dex))
      : weaponModifier(v.sheet, weapon);
    // A magic weapon's +1 to attack and damage (docs/adr/0054-items-as-data.md §5).
    const magic = wieldedBonus(state, v.entityId, weapon);
    return {
      melee,
      reachFt,
      normalRangeFt: range?.normalFt ?? definition.normalRangeFt,
      longRangeFt: range?.longFt ?? definition.longRangeFt,
      bonus:
        (monkWeapon
          ? modifier + proficiencyBonus(totalLevel(v.sheet))
          : weaponAttackBonus(v.sheet, weapon)) + magic.attack,
      extraDamage: [],
      damage: {
        count: definition.damageDice.count,
        sides: Math.max(
          twoHands ? definition.versatileSides : definition.damageDice.sides,
          monkWeapon ? art : 0,
        ) as Damage['sides'],
        // A Rage's damage with a Strength attack (docs/adr/0056-characters-from-the-srd.md §4).
        bonus:
          modifier +
          (definition.flatDamage ?? 0) +
          magic.damage +
          (usesStrength(v.sheet, weapon) ? rageDamage(v.sheet) : 0),
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
  return blockAttack(v.block, attackId);
}

/** A stat block's attack, a creature's or a Druid's Wild Shape form's (ADR 0056 §5). */
function blockAttack(block: StatBlock, attackId: string): WeaponView | WeaponRefusal {
  const attack = block.attacks.find((a) => a.attackId === attackId);
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
