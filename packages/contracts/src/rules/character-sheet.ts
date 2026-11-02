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
  /** Reactions (docs/adr/0046-reactions-beyond-counterspell.md §3–4). */
  'shield',
  'hellish-rebuke',
  /** The reaction to a fall (docs/adr/0049-space-and-movement.md §8). */
  'feather-fall',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

/**
 * The weapons the rules know (SRD 5.2.1 mechanics; `@ltw/rules` WEAPONS). The longbow came first;
 * the next joined with the Ravenford weapons of the item catalog (Stage 520); the rest of the SRD's
 * weapon table, firearms apart, with the weapons' rules (docs/adr/0047-weapons.md). Only grows.
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
  'club',
  'greatclub',
  'javelin',
  'light-hammer',
  'sickle',
  'dart',
  'sling',
  'flail',
  'glaive',
  'greataxe',
  'greatsword',
  'halberd',
  'lance',
  'maul',
  'morningstar',
  'pike',
  'trident',
  'war-pick',
  'whip',
  'blowgun',
  'hand-crossbow',
  'heavy-crossbow',
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** The weapon masteries (SRD 5.2.1; docs/adr/0047-weapons.md §2). */
export const WEAPON_MASTERIES = [
  'cleave',
  'graze',
  'nick',
  'push',
  'sap',
  'slow',
  'topple',
  'vex',
] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

/** The SRD's damage types (SRD 5.2.1). */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

const hitPointValue = z.number().int().min(0).max(999);

/**
 * Hit points (docs/adr/0048-hit-points.md): temporary ones beside them, spent first; a maximum an
 * effect lowered, until a Long Rest restores it. Current never exceeds the lowered maximum.
 */
export const hitPointsSchema = z
  .object({
    max: z.number().int().min(1).max(999),
    current: hitPointValue,
    temporary: z.number().int().min(1).max(999).optional(),
    reducedBy: z.number().int().min(1).max(999).optional(),
  })
  .strict();
export type HitPoints = z.infer<typeof hitPointsSchema>;
/** The maximum an effect may have lowered (ADR 0048 §2). */
export const effectiveMaximum = (hp: HitPoints): number =>
  Math.max(0, hp.max - (hp.reducedBy ?? 0));

/** Resistance, Vulnerability and Immunity by damage type (ADR 0048 §3); absent: none. */
const damageTypes = z.array(z.enum(DAMAGE_TYPES)).max(DAMAGE_TYPES.length).optional();
export const damageDefensesShape = {
  resistances: damageTypes,
  vulnerabilities: damageTypes,
  immunities: damageTypes,
};

/** The kinds of ammunition a weapon fires (ADR 0047 §5): carried as items, spent by attacks. */
export const AMMUNITION_KINDS = ['arrow', 'bolt', 'bullet', 'needle'] as const;
export type AmmunitionKind = (typeof AMMUNITION_KINDS)[number];

/** The classes sheets may hold (Stage 605 added the Fighter, the Rogue and the Cleric). */
export const CLASS_IDS = ['ranger', 'wizard', 'fighter', 'rogue', 'cleric'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Hit Point Dice by size (SRD 5.2.1); each class has one (Stage 530, `@ltw/rules`). */
export const HIT_DIE_SIDES = [6, 8, 10, 12] as const;
export type HitDieSides = (typeof HIT_DIE_SIDES)[number];
const spentDice = z.number().int().min(0).max(20);

/**
 * Creature sizes (SRD 5.2.1; docs/adr/0049-space-and-movement.md §1): a Large creature fills 2×2
 * squares, a Huge one 3×3, a Gargantuan one 4×4; a Tiny one shares its square with other Tiny ones.
 */
export const CREATURE_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

const feet = z.number().int().min(0).max(200).multipleOf(5);

/**
 * Speeds beside walking (docs/adr/0049-space-and-movement.md §5), in feet; `hover` keeps a flyer
 * aloft when it cannot move. Absent: none.
 */
export const speedsSchema = z
  .object({
    fly: feet.optional(),
    swim: feet.optional(),
    climb: feet.optional(),
    burrow: feet.optional(),
    hover: z.literal(true).optional(),
  })
  .strict();
export type Speeds = z.infer<typeof speedsSchema>;

/**
 * Senses beside sight, with their ranges in feet (docs/adr/0050-the-world-around.md §2):
 * Darkvision lifts the light a step, Blindsight and Truesight see whatever is there.
 */
export const sensesSchema = z
  .object({
    blindsight: feet.optional(),
    darkvision: feet.optional(),
    tremorsense: feet.optional(),
    truesight: feet.optional(),
  })
  .strict();
export type Senses = z.infer<typeof sensesSchema>;

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
    hitPoints: hitPointsSchema,
    ...damageDefensesShape,
    armorClass: z.number().int().min(1).max(40),
    speedFt: z.number().int().min(0).max(200).multipleOf(5),
    /** Its size (docs/adr/0049-space-and-movement.md §1); absent: Medium. */
    size: z.enum(CREATURE_SIZES).optional(),
    /** Its speeds beside walking (ADR 0049 §5); absent: none. */
    speeds: speedsSchema.optional(),
    senses: sensesSchema.optional(),
    savingThrows: z.array(z.enum(ABILITIES)),
    skills: z
      .object({ proficient: z.array(z.enum(skillIds)), expertise: z.array(z.enum(skillIds)) })
      .strict(),
    fightingStyle: z.enum(['archery']).optional(),
    attacksPerAction: z.number().int().min(1).max(4),
    weapons: z.array(z.enum(WEAPON_IDS)),
    /**
     * The kinds of weapon whose mastery the character uses (docs/adr/0047-weapons.md §2); absent: as
     * many of its sheet's weapons, in order, as its classes' Weapon Mastery allows.
     */
    weaponMasteries: z.array(z.enum(WEAPON_IDS)).max(8).optional(),
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
    /**
     * Knocked out (docs/adr/0048-hit-points.md §4): Unconscious at 1 hit point until it regains
     * hit points or first aid wakes it; absent otherwise.
     */
    knockedOut: z.literal(true).optional(),
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
    if (sheet.hitPoints.current > effectiveMaximum(sheet.hitPoints))
      issue('current HP exceeds maximum');
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
