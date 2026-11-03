import {
  SKILLS,
  type Ability,
  type CharacterSheet,
  type ClassId,
  type Skill,
  type SpellcastingSource,
} from '@ltw/contracts';

/** Derived numbers from a character sheet (SRD 5.2.1; docs/adr/0011-ruleset-srd-5-2.md). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function totalLevel(sheet: CharacterSheet): number {
  return sheet.classes.reduce((total, entry) => total + entry.level, 0);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function modifierOf(sheet: CharacterSheet, ability: Ability): number {
  return abilityModifier(sheet.abilities[ability]);
}

export function skillModifier(sheet: CharacterSheet, skill: Skill): number {
  const proficiency = proficiencyBonus(totalLevel(sheet));
  const multiplier = sheet.skills.expertise.includes(skill)
    ? 2
    : sheet.skills.proficient.includes(skill)
      ? 1
      : 0;
  return modifierOf(sheet, SKILLS[skill]) + multiplier * proficiency;
}

export function savingThrowModifier(sheet: CharacterSheet, ability: Ability): number {
  const proficient = sheet.savingThrows.includes(ability);
  // A Ring of Protection's +1, and the like (docs/adr/0054-items-as-data.md §5).
  const items = sheet.saveBonus ?? 0;
  return (
    modifierOf(sheet, ability) + (proficient ? proficiencyBonus(totalLevel(sheet)) : 0) + items
  );
}

export function spellSaveDc(sheet: CharacterSheet, source: SpellcastingSource): number {
  return 8 + proficiencyBonus(totalLevel(sheet)) + modifierOf(sheet, source.ability);
}

export function spellAttackBonus(sheet: CharacterSheet, source: SpellcastingSource): number {
  return proficiencyBonus(totalLevel(sheet)) + modifierOf(sheet, source.ability);
}

/** The casting sources that list a spell (a spell may come from several). */
export function sourcesFor(sheet: CharacterSheet, spellId: string): SpellcastingSource[] {
  return sheet.spellcasting.filter((source) => source.spells.includes(spellId));
}

/** The SRD's Multiclass Spellcaster rule: full casters' levels, half casters' halved; the
 * Warlock's Pact Magic apart (docs/adr/0056-characters-from-the-srd.md §3). */
const FULL_CASTERS: ReadonlySet<ClassId> = new Set([
  'wizard',
  'cleric',
  'bard',
  'druid',
  'sorcerer',
]);
const HALF_CASTERS: ReadonlySet<ClassId> = new Set(['ranger', 'paladin']);

/** SRD 5.2.1 Multiclass Spellcaster table, levels 1-20, slot levels 1-9. */
const MULTICLASS_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Caster level: all full-caster levels plus half the half-caster levels, rounded up. */
export function multiclassCasterLevel(classes: CharacterSheet['classes']): number {
  let full = 0;
  let half = 0;
  for (const entry of classes) {
    if (FULL_CASTERS.has(entry.classId)) full += entry.level;
    if (HALF_CASTERS.has(entry.classId)) half += entry.level;
  }
  return full + Math.ceil(half / 2);
}

/** Spell slots by level (index 0 = level 1) for a multiclass spellcaster. */
export function spellSlotsFor(classes: CharacterSheet['classes']): number[] {
  const level = multiclassCasterLevel(classes);
  const row = level === 0 ? [] : (MULTICLASS_SLOTS[Math.min(level, 20) - 1] ?? []);
  return Array.from({ length: 9 }, (_, index) => row[index] ?? 0);
}

export function slotsRemaining(sheet: CharacterSheet, slotLevel: number): number {
  const index = slotLevel - 1;
  return (sheet.spellSlots.max[index] ?? 0) - (sheet.spellSlots.expended[index] ?? 0);
}
