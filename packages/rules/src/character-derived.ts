import {
  ABILITIES,
  SKILLS,
  type Ability,
  type CharacterDerived,
  type CharacterSheet,
  type SrdSchool,
  type Skill,
  type WeaponId,
  type AmmunitionKind,
  type CreatureSize,
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
import { appliedFeatures, rageDamage, usesStrength } from './features/numbers.ts';
import { classResources } from './features/resources.ts';
import { masteryOf } from './masteries.ts';
import { spellRules, type SpellRules } from './spell-rules.ts';
import { srdSpell } from './srd/catalog.ts';
import { spellIn } from './srd/catalogs-ru.ts';
import type { ReferenceLanguage } from './srd/reference-ru.ts';
import { hitDice } from './rest.ts';
import { effectiveSpeedFt } from './turn.ts';
import { proficienciesOf } from './proficiencies.ts';

/** Strength score × 15 lb (SRD 5.2.1 carrying capacity, Small or Medium size). */
const CAPACITY_PER_STRENGTH_LB = 15;
/** The Carrying Capacity table's factor by size: half Tiny, doubled each size past Medium. */
const SIZE_FACTOR: Readonly<Record<CreatureSize, number>> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
};

export const carryingCapacityLb = (sheet: CharacterSheet): number =>
  sheet.abilities.str * CAPACITY_PER_STRENGTH_LB * SIZE_FACTOR[sheet.size ?? 'medium'];

/**
 * The most a load lets its carrier move where the campaign enforces carrying (SRD 5.2.1, Carrying
 * Capacity; docs/adr/0056-characters-from-the-srd.md §3): past what it can carry it drags the rest,
 * at 5 ft at most; past what it can drag, lift or push — twice that — it cannot move with it. Null
 * when it carries it all.
 */
export function loadSpeedFt(sheet: CharacterSheet, carriedLb: number): number | null {
  const capacity = carryingCapacityLb(sheet);
  if (carriedLb <= capacity) return null;
  return carriedLb <= 2 * capacity ? 5 : 0;
}

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
    // A Rage's damage with a Strength attack (docs/adr/0056-characters-from-the-srd.md §4).
    damage: {
      ...weapon.damageDice,
      bonus:
        weaponModifier(sheet, weaponId) + (usesStrength(sheet, weaponId) ? rageDamage(sheet) : 0),
    },
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
  /** The campaign's language: an SRD spell's words in Russian once they exist (ADR 0055 §5). */
  language: ReferenceLanguage = 'en',
  /** The most its load lets it move, where the campaign enforces carrying (`loadSpeedFt`). */
  loadSpeed: number | null = null,
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
  const atWill = new Set(sheet.spellcasting.flatMap((source) => source.atWill ?? []));
  return {
    level,
    proficiencyBonus: proficiencyBonus(level),
    abilities,
    skills,
    initiative: abilityModifier(sheet.abilities.dex),
    // Speed after conditions and Exhaustion (docs/adr/0045-conditions-and-actions.md §1, §3).
    speedFt:
      loadSpeed === null ? effectiveSpeedFt(sheet) : Math.min(loadSpeed, effectiveSpeedFt(sheet)),
    ...(loadSpeed === null ? {} : { loadSpeedFt: loadSpeed }),
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
        // The SRD's name in the campaign's language; the client's dictionary names the slice's.
        name: spellWordsIn(spell.spellId, language)?.value.name ?? spell.spellId,
        ...schoolOf(spell.spellId),
        level: spell.level,
        castingTime: spell.castingTime,
        range: spell.range,
        components: [...spell.components],
        concentration: spell.concentration,
        ritual: spell.ritual,
        ...(atWill.has(spell.spellId) ? { atWill: true as const } : {}),
        ...(spell.mechanics ? srdWords(spell, language) : {}),
      })),
    resources: classResources(sheet),
    applied: appliedFeatures(sheet),
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
    proficiencies: proficienciesOf(sheet, language),
    hitDice: hitDice(sheet).map(({ sides, total, left }) => ({ sides, total, left })),
  };
}

/** An SRD spell's school, for its school's picture (docs/adr/0055-…md §6). */
const schoolOf = (spellId: string): { school?: SrdSchool } => {
  const school = srdSpell(spellId)?.school;
  return school === undefined ? {} : { school };
};

const spellWordsIn = (spellId: string, language: ReferenceLanguage) => {
  const entry = srdSpell(spellId);
  return entry ? spellIn(entry, language) : null;
};

/** An SRD spell's text, with what the server leaves to the DM (docs/adr/0052-spells-as-data.md). */
function srdWords(
  spell: SpellRules,
  language: ReferenceLanguage,
): { text?: string; textLanguage?: 'en' | 'ru'; forDm?: 'effect' | 'rest' } {
  const words = spellWordsIn(spell.spellId, language);
  const higher = words?.value.higherLevels ? `\n${words.value.higherLevels}` : '';
  const forDm =
    spell.mechanics?.effect.kind === 'dm' ? 'effect' : spell.mechanics?.complete ? null : 'rest';
  return {
    ...(words ? { text: `${words.value.description}${higher}`, textLanguage: words.language } : {}),
    ...(forDm ? { forDm } : {}),
  };
}
