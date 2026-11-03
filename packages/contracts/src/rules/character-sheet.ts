import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import { featureUsesSchema, inspirationDieSchema, ragingSchema } from './class-features.ts';
import { CONTAGION_IDS, contagionStateSchema } from './contagions.ts';
import { DAMAGE_TYPES, WEAPON_IDS } from './weapon-ids.ts';

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

export {
  DAMAGE_TYPES,
  WEAPON_IDS,
  WEAPON_MASTERIES,
  type DamageType,
  type WeaponId,
  type WeaponMastery,
} from './weapon-ids.ts';

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
/** A sling's bullets and a firearm's are not the same (SRD 5.2.1 Ammunition table). */
export const AMMUNITION_KINDS = ['arrow', 'bolt', 'bullet', 'needle', 'firearm-bullet'] as const;
export type AmmunitionKind = (typeof AMMUNITION_KINDS)[number];

/**
 * The classes sheets may hold: Stage 605 added the Fighter, the Rogue and the Cleric, Stage 660 the
 * SRD's other seven (docs/adr/0056-characters-from-the-srd.md). The list only grows.
 */
export const CLASS_IDS = [
  'ranger',
  'wizard',
  'fighter',
  'rogue',
  'cleric',
  'barbarian',
  'bard',
  'druid',
  'monk',
  'paladin',
  'sorcerer',
  'warlock',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The SRD's Fighting Style feats; the list only grows. */
export const FIGHTING_STYLES = [
  'archery',
  'defense',
  'great-weapon-fighting',
  'two-weapon-fighting',
] as const;
export type FightingStyle = (typeof FIGHTING_STYLES)[number];

/** The orders a Cleric or a Druid chooses at level 1: the Divine and the Primal Orders. */
export const CLASS_ORDERS = ['protector', 'thaumaturge', 'magician', 'warden'] as const;
export type ClassOrder = (typeof CLASS_ORDERS)[number];

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
    /** A class's casting (the Warlock's Pact Magic), or the Magic Initiate feat. */
    source: z.enum([
      'ranger',
      'wizard',
      'cleric',
      'magic-initiate',
      'bard',
      'druid',
      'paladin',
      'sorcerer',
      'warlock',
      // A species' lineage or legacy (an Elf's, a Gnome's, a Tiefling's).
      'species',
    ]),
    ability: z.enum(ABILITIES),
    /** SRD spells by their catalog id (docs/adr/0052-spells-as-data.md §1). */
    spells: z.array(srdIdSchema).min(1).max(120),
    /**
     * Spells of its list cast without a slot, as often as wished: a Warlock's invocations'
     * (docs/adr/0056-characters-from-the-srd.md §4).
     */
    atWill: z.array(srdIdSchema).min(1).max(12).optional(),
    /** Slot-free casts per Long Rest (Favored Enemy, Magic Initiate). */
    freeCasts: z
      .object({
        spellId: srdIdSchema,
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
    /**
     * What worn, attuned magic items add to every saving throw: a Ring of Protection's +1
     * (docs/adr/0054-items-as-data.md §5). Kept by the item rules; absent: none.
     */
    saveBonus: z.number().int().min(-10).max(10).optional(),
    skills: z
      .object({ proficient: z.array(z.enum(skillIds)), expertise: z.array(z.enum(skillIds)) })
      .strict(),
    /** Its Fighting Style feat (docs/adr/0056-…md §2); absent: none. */
    fightingStyle: z.enum(FIGHTING_STYLES).optional(),
    /** Its species and background (docs/adr/0056-…md §2); absent on a sheet written by hand. */
    origin: z
      .object({
        speciesId: srdIdSchema,
        speciesOption: z.string().min(1).max(40).optional(),
        backgroundId: srdIdSchema,
      })
      .strict()
      .optional(),
    /** Its feats by SRD id (an Origin feat, a Fighting Style feat…); absent: none recorded. */
    feats: z.array(srdIdSchema).max(30).optional(),
    /** The tools it is proficient with, by catalog id; absent: none recorded. */
    tools: z
      .array(z.string().regex(/^srd-[a-z0-9-]+$/))
      .max(20)
      .optional(),
    /** A Cleric's or a Druid's order and a Warlock's invocations; absent: none. */
    classChoices: z
      .object({
        order: z.enum(CLASS_ORDERS).optional(),
        invocations: z.array(srdIdSchema).max(10).optional(),
        /** A Sorcerer's Metamagic options. */
        metamagic: z.array(srdIdSchema).max(10).optional(),
        /** A Wizard's spellbook: the level 1+ spells it may prepare. */
        spellbook: z.array(srdIdSchema).max(80).optional(),
      })
      .strict()
      .optional(),
    /** Its experience points (docs/adr/0056-…md §3); absent: none counted. */
    experience: z.number().int().min(0).max(10_000_000).optional(),
    /** Levels the DM granted that its player has yet to take (a milestone); absent: none. */
    pendingLevels: z.number().int().min(1).max(19).optional(),
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
        spellId: srdIdSchema,
        /** The creature a targeted Concentration spell (Hunter's Mark) is on. */
        targetId: entityIdSchema.optional(),
        /** Extended Spell: Advantage on saves to keep it (docs/adr/0056-…md §4). */
        extended: z.literal(true).optional(),
      })
      .strict()
      .nullable(),
    /** Heroic Inspiration (SRD 5.2.1), granted by the DM (docs/adr/0043-dm-screen.md §1); absent: none. */
    heroicInspiration: z.boolean().optional(),
    /**
     * The body armor worn, as the rules need it (docs/adr/0050-the-world-around.md §10): light,
     * medium or heavy; the Strength it asks; Disadvantage on Stealth. Absent: none.
     */
    wornArmor: z
      .object({
        weight: z.enum(['light', 'medium', 'heavy']),
        strength: z.number().int().min(1).max(30).optional(),
        stealthDisadvantage: z.literal(true).optional(),
      })
      .strict()
      .optional(),
    /**
     * World time (seconds) the last Long Rest began: one in 24 hours
     * (docs/adr/0050-the-world-around.md §5). Absent: none yet.
     */
    lastLongRestAt: z.number().int().min(0).optional(),
    /**
     * Knocked out (docs/adr/0048-hit-points.md §4): Unconscious at 1 hit point until it regains
     * hit points or first aid wakes it; absent otherwise.
     */
    knockedOut: z.literal(true).optional(),
    /**
     * The magical contagions it carries (docs/adr/0055-rules-reference-and-toolbox.md §4), one of
     * each at most; absent when none.
     */
    contagions: z
      .array(contagionStateSchema)
      .max(CONTAGION_IDS.length)
      .refine(
        (list) => new Set(list.map((one) => one.contagionId)).size === list.length,
        'One of each contagion',
      )
      .optional(),
    /**
     * Back from the dead (docs/adr/0056-characters-from-the-srd.md §5): the penalty to every D20
     * Test it still takes, 1 less at each Long Rest; absent at 0.
     */
    ordeal: z.number().int().min(1).max(4).optional(),
    /** Death saving throws while at 0 HP (ADR 0015 §4); absent when not dying. */
    deathSaves: z
      .object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      })
      .strict()
      .optional(),
    /**
     * Class features spent since their rests, a Rage while it lasts, and a Bardic Inspiration die
     * held (docs/adr/0056-characters-from-the-srd.md §4); absent: none.
     */
    featureUses: featureUsesSchema.optional(),
    raging: ragingSchema.optional(),
    inspirationDie: inspirationDieSchema.optional(),
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
      if (source.atWill?.some((spellId) => !source.spells.includes(spellId))) {
        issue(`${source.source} at-will spells must be among its spells`);
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
