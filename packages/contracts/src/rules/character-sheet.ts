import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Canonical character sheet for the slice (docs/adr/0011-ruleset-srd-5-2.md).
 * Static statistics plus current resources. Only slice mechanics are
 * modeled; values the spec fixes (HP, AC, Speed) are recorded, not derived.
 */
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

/**
 * The 18 SRD 5.2.1 skills and their abilities. The slice's checks use the first six; a sheet may be
 * proficient in any (Stage 500, docs/PRODUCT_COMPLETION_PLAN.md decision 6). The order is the
 * slice's first, so earlier lists keep their order.
 */
export const SKILLS = {
  perception: 'wis',
  investigation: 'int',
  insight: 'wis',
  survival: 'wis',
  arcana: 'int',
  stealth: 'dex',
  athletics: 'str',
  acrobatics: 'dex',
  'sleight-of-hand': 'dex',
  history: 'int',
  nature: 'int',
  religion: 'int',
  'animal-handling': 'wis',
  medicine: 'wis',
  deception: 'cha',
  intimidation: 'cha',
  performance: 'cha',
  persuasion: 'cha',
} as const satisfies Record<string, Ability>;
export type Skill = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as [Skill, ...Skill[]];
const skillIds = SKILL_IDS;

export const SPELL_IDS = [
  'hunters-mark',
  'detect-magic',
  'healing-word',
  'misty-step',
  'fireball',
  'counterspell',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

/**
 * The weapons the rules know (SRD 5.2.1 mechanics; `@ltw/rules` WEAPONS). The longbow came first;
 * the rest join with the Ravenford weapons of the item catalog (Stage 520).
 */
export const WEAPON_IDS = [
  'longbow',
  'shortbow',
  'light-crossbow',
  'dagger',
  'shortsword',
  'longsword',
  'rapier',
  'scimitar',
  'handaxe',
  'battleaxe',
  'mace',
  'warhammer',
  'quarterstaff',
  'spear',
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** The classes sheets may hold (Stage 605 added the Fighter, the Rogue and the Cleric). */
export const CLASS_IDS = ['ranger', 'wizard', 'fighter', 'rogue', 'cleric'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Hit Point Dice by size (SRD 5.2.1); each class has one (Stage 530, `@ltw/rules`). */
export const HIT_DIE_SIDES = [6, 8, 10, 12] as const;
export type HitDieSides = (typeof HIT_DIE_SIDES)[number];
const spentDice = z.number().int().min(0).max(20);

/**
 * The SRD 5.2.1 conditions (docs/adr/0045-conditions-and-actions.md §1), Exhaustion apart (a level,
 * §3), and the Slow mastery's Slowed. Paralyzed, Petrified, Stunned and Unconscious include
 * Incapacitated; Unconscious (a character at 0 HP, ADR 0015 §4) brings Prone with it. The list only
 * grows, so stored events stay readable.
 */
export const CONDITIONS = [
  'incapacitated',
  'prone',
  'slowed',
  'unconscious',
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'restrained',
  'stunned',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Exhaustion's levels (§3): each takes 2 from every D20 Test and 5 ft from Speed; 6 kills. */
export const MAX_EXHAUSTION = 6;
export const exhaustionSchema = z.number().int().min(1).max(MAX_EXHAUSTION);

const score = z.number().int().min(1).max(30);
const slotRow = z.array(z.number().int().min(0).max(4)).length(9);

export const spellcastingSourceSchema = z
  .object({
    /** Ranger, Wizard and Cleric class casting, or the Magic Initiate (Cleric) feat. */
    source: z.enum(['ranger', 'wizard', 'cleric', 'magic-initiate']),
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
    /** Exhaustion's level (ADR 0045 §3); absent: none. */
    exhaustion: exhaustionSchema.optional(),
    concentration: z
      .object({
        spellId: z.enum(SPELL_IDS),
        /** The creature a targeted Concentration spell (Hunter's Mark) is on. */
        targetId: entityIdSchema.optional(),
      })
      .strict()
      .nullable(),
    /** Heroic Inspiration (SRD 5.2.1), granted by the DM (docs/adr/0043-dm-screen.md §1); absent: none. */
    heroicInspiration: z.boolean().optional(),
    /** Death saving throws while at 0 HP (ADR 0015 §4); absent when not dying. */
    deathSaves: z
      .object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      })
      .strict()
      .optional(),
    /** Hit Point Dice spent since the last long rest, by size; absent when none is (Stage 530). */
    hitDiceSpent: z
      .object({ d6: spentDice, d8: spentDice, d10: spentDice, d12: spentDice })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((sheet, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message });
    };
    if (sheet.hitPoints.current > sheet.hitPoints.max) issue('current HP exceeds maximum');
    const dice = sheet.hitDiceSpent;
    const spent = (dice?.d6 ?? 0) + (dice?.d8 ?? 0) + (dice?.d10 ?? 0) + (dice?.d12 ?? 0);
    if (spent > sheet.classes.reduce((sum, entry) => sum + entry.level, 0)) {
      issue('more Hit Point Dice spent than the character has');
    }
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
