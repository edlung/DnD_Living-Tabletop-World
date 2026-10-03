import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Canonical character sheet for the slice (docs/adr/0011-ruleset-srd-5-2.md).
 * Static statistics plus current resources. Only slice mechanics are
 * modeled; values the spec fixes (HP, AC, Speed) are recorded, not derived.
 */
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS = {
  perception: 'wis',
  investigation: 'int',
  insight: 'wis',
  survival: 'wis',
  arcana: 'int',
  stealth: 'dex',
} as const satisfies Record<string, Ability>;
export type Skill = keyof typeof SKILLS;
const skillIds = Object.keys(SKILLS) as [Skill, ...Skill[]];

export const SPELL_IDS = [
  'hunters-mark',
  'detect-magic',
  'healing-word',
  'misty-step',
  'fireball',
  'counterspell',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

export const WEAPON_IDS = ['longbow'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const CLASS_IDS = ['ranger', 'wizard'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Slice conditions; Incapacitated is the one that ends Concentration and blocks actions. */
export const CONDITIONS = ['incapacitated', 'prone', 'slowed'] as const;
export type Condition = (typeof CONDITIONS)[number];

const score = z.number().int().min(1).max(30);
const slotRow = z.array(z.number().int().min(0).max(4)).length(9);

export const spellcastingSourceSchema = z
  .object({
    /** Ranger and Wizard class casting, or the Magic Initiate (Cleric) feat. */
    source: z.enum(['ranger', 'wizard', 'magic-initiate']),
    ability: z.enum(ABILITIES),
    spells: z.array(z.enum(SPELL_IDS)).min(1),
    /** Slot-free casts per Long Rest (Favored Enemy, Magic Initiate). */
    freeCasts: z
      .object({
        spellId: z.enum(SPELL_IDS),
        perLongRest: z.number().int().min(1).max(9),
        used: z.number().int().min(0).max(9),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SpellcastingSource = z.infer<typeof spellcastingSourceSchema>;

export const characterSheetSchema = z
  .object({
    classes: z
      .array(
        z
          .object({
            classId: z.enum(CLASS_IDS),
            level: z.number().int().min(1).max(20),
            subclass: z.string().min(1).max(60).optional(),
          })
          .strict(),
      )
      .min(1),
    abilities: z
      .object({ str: score, dex: score, con: score, int: score, wis: score, cha: score })
      .strict(),
    hitPoints: z
      .object({ max: z.number().int().min(1).max(999), current: z.number().int().min(0).max(999) })
      .strict(),
    armorClass: z.number().int().min(1).max(40),
    speedFt: z.number().int().min(0).max(200).multipleOf(5),
    savingThrows: z.array(z.enum(ABILITIES)),
    skills: z
      .object({ proficient: z.array(z.enum(skillIds)), expertise: z.array(z.enum(skillIds)) })
      .strict(),
    fightingStyle: z.enum(['archery']).optional(),
    attacksPerAction: z.number().int().min(1).max(4),
    weapons: z.array(z.enum(WEAPON_IDS)),
    spellSlots: z.object({ max: slotRow, expended: slotRow }).strict(),
    spellcasting: z.array(spellcastingSourceSchema),
    conditions: z.array(z.enum(CONDITIONS)),
    concentration: z
      .object({ spellId: z.enum(SPELL_IDS) })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((sheet, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message });
    };
    if (sheet.hitPoints.current > sheet.hitPoints.max) issue('current HP exceeds maximum');
    sheet.spellSlots.expended.forEach((used, index) => {
      if (used > (sheet.spellSlots.max[index] ?? 0))
        issue(`more level ${index + 1} slots expended than available`);
    });
    for (const source of sheet.spellcasting) {
      if (source.freeCasts && source.freeCasts.used > source.freeCasts.perLongRest) {
        issue(`${source.source} free casts overused`);
      }
      if (source.freeCasts && !source.spells.includes(source.freeCasts.spellId)) {
        issue(`${source.source} free cast must be one of its spells`);
      }
    }
    if (sheet.skills.expertise.some((skill) => !sheet.skills.proficient.includes(skill))) {
      issue('expertise requires proficiency');
    }
  });
export type CharacterSheet = z.infer<typeof characterSheetSchema>;

export const setCharacterSheetCommandSchema = z
  .object({
    type: z.literal('SetCharacterSheet'),
    entityId: entityIdSchema,
    sheet: characterSheetSchema,
  })
  .strict();
