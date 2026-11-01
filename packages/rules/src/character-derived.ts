import {
  ABILITIES,
  SKILLS,
  type Ability,
  type CharacterDerived,
  type CharacterSheet,
  type Skill,
} from '@ltw/contracts';

import { weaponAttackBonus } from './attacks.ts';
import { SPELLS, WEAPONS } from './catalog.ts';
import {
  abilityModifier,
  modifierOf,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDc,
  totalLevel,
} from './character-math.ts';

/** Strength score × 15 lb (SRD 5.2.1 carrying capacity, Medium size). */
const CAPACITY_PER_STRENGTH_LB = 15;

const proficiencyOf = (sheet: CharacterSheet, skill: Skill) =>
  sheet.skills.expertise.includes(skill)
    ? 'expertise'
    : sheet.skills.proficient.includes(skill)
      ? 'proficient'
      : 'none';

/**
 * Everything the rules derive from a sheet for the character view (Stage 500): the server adds it to
 * the sheet response, so the client shows rule numbers without computing them.
 */
export function deriveCharacter(sheet: CharacterSheet): CharacterDerived {
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
      .map((spellId) => SPELLS[spellId])
      .sort((a, b) => a.level - b.level || a.spellId.localeCompare(b.spellId))
      .map((spell) => ({
        spellId: spell.spellId,
        level: spell.level,
        castingTime: spell.castingTime,
        range: spell.range,
        components: [...spell.components],
        concentration: spell.concentration,
      })),
    attacks: sheet.weapons.map((weaponId) => {
      const weapon = WEAPONS[weaponId];
      return {
        weaponId,
        attackBonus: weaponAttackBonus(sheet, weaponId),
        damage: { ...weapon.damageDice, bonus: modifierOf(sheet, weapon.ability) },
        damageType: weapon.damageType,
        ranged: weapon.ranged,
        normalRangeFt: weapon.normalRangeFt,
        longRangeFt: weapon.longRangeFt,
      };
    }),
    carryingCapacityLb: sheet.abilities.str * CAPACITY_PER_STRENGTH_LB,
  };
}
