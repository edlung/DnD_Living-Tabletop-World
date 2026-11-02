import {
  ABILITIES,
  SKILLS,
  type Ability,
  type CharacterDerived,
  type CharacterSheet,
  type Skill,
  type WeaponId,
  type AmmunitionKind,
} from '@ltw/contracts';

import { weaponAttackBonus, weaponModifier } from './attacks.ts';
import { WEAPONS } from './catalog.ts';
import {
  abilityModifier,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDc,
  totalLevel,
} from './character-math.ts';
import { masteryOf } from './masteries.ts';
import { spellRules, type SpellRules } from './spell-rules.ts';
import { srdSpell } from './srd/catalog.ts';
import { hitDice } from './rest.ts';
import { effectiveSpeedFt } from './turn.ts';

/** Strength score × 15 lb (SRD 5.2.1 carrying capacity, Medium size). */
const CAPACITY_PER_STRENGTH_LB = 15;

export const carryingCapacityLb = (sheet: CharacterSheet): number =>
  sheet.abilities.str * CAPACITY_PER_STRENGTH_LB;

const proficiencyOf = (sheet: CharacterSheet, skill: Skill) =>
  sheet.skills.expertise.includes(skill)
    ? 'expertise'
    : sheet.skills.proficient.includes(skill)
      ? 'proficient'
      : 'none';

/** A weapon's attack for this sheet: bonus to hit, damage dice and modifier, reach or range. */
export function weaponAttack(sheet: CharacterSheet, weaponId: WeaponId) {
  const weapon = WEAPONS[weaponId];
  return {
    weaponId,
    attackBonus: weaponAttackBonus(sheet, weaponId),
    damage: { ...weapon.damageDice, bonus: weaponModifier(sheet, weaponId) },
    damageType: weapon.damageType,
    ranged: weapon.ranged,
    normalRangeFt: weapon.normalRangeFt,
    longRangeFt: weapon.longRangeFt,
    properties: [...weapon.properties],
  };
}

/**
 * Everything the rules derive from a sheet for the character view (Stage 500): the server adds it to
 * the sheet response, so the client shows rule numbers without computing them. `wielded` are the
 * weapon items the character holds (Stage 520), attacked with beside the sheet's own weapons.
 */
export function deriveCharacter(
  sheet: CharacterSheet,
  wielded: readonly WeaponId[] = [],
  /** The ammunition it carries, by kind, where it is counted (docs/adr/0047-weapons.md §5). */
  ammunition: Readonly<Partial<Record<AmmunitionKind, number>>> = {},
): CharacterDerived {
  const level = totalLevel(sheet);
  const abilities = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      {
        score: sheet.abilities[ability],
        modifier: abilityModifier(sheet.abilities[ability]),
        save: savingThrowModifier(sheet, ability),
        saveProficient: sheet.savingThrows.includes(ability),
      },
    ]),
  ) as CharacterDerived['abilities'];
  const skills = Object.fromEntries(
    (Object.entries(SKILLS) as [Skill, Ability][]).map(([skill, ability]) => [
      skill,
      { ability, total: skillModifier(sheet, skill), proficiency: proficiencyOf(sheet, skill) },
    ]),
  ) as CharacterDerived['skills'];
  const spellIds = [...new Set(sheet.spellcasting.flatMap((source) => source.spells))];
  return {
    level,
    proficiencyBonus: proficiencyBonus(level),
    abilities,
    skills,
    initiative: abilityModifier(sheet.abilities.dex),
    // Speed after conditions and Exhaustion (docs/adr/0045-conditions-and-actions.md §1, §3).
    speedFt: effectiveSpeedFt(sheet),
    passive: {
      perception: 10 + skills.perception.total,
      investigation: 10 + skills.investigation.total,
      insight: 10 + skills.insight.total,
    },
    spellcasting: sheet.spellcasting.map((source) => ({
      source: source.source,
      ability: source.ability,
      saveDc: spellSaveDc(sheet, source),
      attackBonus: spellAttackBonus(sheet, source),
    })),
    spells: spellIds
      .flatMap((spellId) => {
        const rules = spellRules(spellId);
        return rules ? [rules] : [];
      })
      .sort((a, b) => a.level - b.level || a.spellId.localeCompare(b.spellId))
      .map((spell: SpellRules) => ({
        spellId: spell.spellId,
        // The SRD's English name; the client's dictionary names the slice's spells.
        name: srdSpell(spell.spellId)?.name ?? spell.spellId,
        level: spell.level,
        castingTime: spell.castingTime,
        range: spell.range,
        components: [...spell.components],
        concentration: spell.concentration,
        ritual: spell.ritual,
        ...(spell.mechanics ? srdWords(spell) : {}),
      })),
    attacks: [...new Set([...sheet.weapons, ...wielded])].map((weaponId) => {
      const attack = weaponAttack(sheet, weaponId);
      const mastery = masteryOf(sheet, weaponId);
      const kind = WEAPONS[weaponId].ammunition;
      const count = kind === undefined ? undefined : ammunition[kind];
      return {
        weaponId,
        attackBonus: attack.attackBonus,
        damage: attack.damage,
        damageType: attack.damageType,
        ranged: attack.ranged,
        normalRangeFt: attack.normalRangeFt,
        longRangeFt: attack.longRangeFt,
        ...(mastery === null ? {} : { mastery }),
        ...(kind === undefined || count === undefined ? {} : { ammunition: { kind, count } }),
      };
    }),
    carryingCapacityLb: carryingCapacityLb(sheet),
    hitDice: hitDice(sheet).map(({ sides, total, left }) => ({ sides, total, left })),
  };
}

/** An SRD spell's text, with what the server leaves to the DM (docs/adr/0052-spells-as-data.md). */
function srdWords(spell: SpellRules): { text?: string; forDm?: 'effect' | 'rest' } {
  const entry = srdSpell(spell.spellId);
  const higher = entry?.higherLevels ? `\n${entry.higherLevels}` : '';
  const forDm =
    spell.mechanics?.effect.kind === 'dm' ? 'effect' : spell.mechanics?.complete ? null : 'rest';
  return {
    ...(entry ? { text: `${entry.description}${higher}` } : {}),
    ...(forDm ? { forDm } : {}),
  };
}
