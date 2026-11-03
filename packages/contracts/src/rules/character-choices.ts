import { z } from 'zod';

import { actorIdSchema, entityIdSchema } from '../kernel/identifiers.ts';
import { entityNameSchema } from '../kernel/world-commands.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import { srdLanguageSchema } from './languages.ts';
import {
  ABILITIES,
  CLASS_IDS,
  CLASS_ORDERS,
  FIGHTING_STYLES,
  SKILL_IDS,
  WEAPON_IDS,
} from './character-sheet.ts';

/**
 * A new character as the builder's choices (docs/adr/0056-characters-from-the-srd.md §2): a class,
 * a species with its option, a background with its ability increases, the ability scores by the
 * standard array, point buy or the World Engine's rolls (4d6 with the lowest dropped, the highest to the ability ranked first), skills, tools, equipment and spells. The
 * client proposes them; the World Engine builds the sheet from the SRD's numbers and refuses what
 * does not hold.
 */
export const ABILITY_METHODS = ['standard-array', 'point-buy', 'rolled'] as const;
export type AbilityMethod = (typeof ABILITY_METHODS)[number];

/** The standard array (SRD 5.2.1, Character Creation step 3). */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
/** Point buy: 27 points, scores 8–15 at these costs. */
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

const score = z.number().int().min(3).max(18);
const scores = z
  .object({ str: score, dex: score, con: score, int: score, wis: score, cha: score })
  .strict();
const catalogId = z.string().regex(/^srd-[a-z0-9]+(-[a-z0-9]+)*$/);

export const characterChoicesSchema = z
  .object({
    classId: z.enum(CLASS_IDS),
    speciesId: srdIdSchema,
    /**
     * A species' choice: a Dragonborn's ancestor ("red"), an Elf's or a Gnome's lineage, a
     * Goliath's giant ancestry, a Tiefling's legacy; absent for one without.
     */
    speciesOption: z.string().min(1).max(40).optional(),
    /** The ability a species' spells use (a lineage's, a legacy's), where it gives spells. */
    speciesAbility: z.enum(['int', 'wis', 'cha']).optional(),
    /** Small or Medium, for a species that chooses; absent: the species' own. */
    size: z.enum(['small', 'medium']).optional(),
    backgroundId: srdIdSchema,
    abilities: z
      .object({
        method: z.enum(ABILITY_METHODS),
        /** The scores before the background's increases: the standard array's or point buy's. */
        base: scores.optional(),
        /** For `rolled`: the abilities from the one to take the highest roll to the lowest's. */
        priority: z.array(z.enum(ABILITIES)).length(6).optional(),
      })
      .strict(),
    /** The background's increases: +2 and +1 to two of its three, or +1 to each. */
    increases: z.union([
      z.object({ plus2: z.enum(ABILITIES), plus1: z.enum(ABILITIES) }).strict(),
      z.object({ each: z.literal(true) }).strict(),
    ]),
    /** The class's skills chosen from its list. */
    skills: z.array(z.enum(SKILL_IDS)).max(4),
    /** Skills a species or a feat gives to choose (Keen Senses, Skillful, Skilled). */
    moreSkills: z.array(z.enum(SKILL_IDS)).max(4),
    /** A Rogue's Expertise: two of its skills. */
    expertise: z.array(z.enum(SKILL_IDS)).max(2),
    /** Tools a class or a background asks to pick (a Bard's three instruments). */
    tools: z.array(catalogId).max(4),
    /**
     * Two standard languages beside Common, and a Rogue's one more of either table (SRD 5.2.1);
     * absent until chosen.
     */
    languages: z.array(srdLanguageSchema).max(3).optional(),
    /** The options of the class's and the background's starting equipment, and the picks they ask. */
    equipment: z
      .object({
        classOption: z.enum(['A', 'B', 'C']),
        backgroundOption: z.enum(['A', 'B']),
        picks: z.array(catalogId).max(3),
      })
      .strict(),
    /** A Human's Origin feat (Versatile); the background gives its own. */
    originFeat: srdIdSchema.optional(),
    /** Magic Initiate's list, two cantrips and a level 1 spell, and its ability. */
    magicInitiate: z
      .object({
        list: z.enum(['cleric', 'druid', 'wizard']),
        ability: z.enum(['int', 'wis', 'cha']),
        cantrips: z.array(srdIdSchema).length(2),
        spell: srdIdSchema,
      })
      .strict()
      .optional(),
    fightingStyle: z.enum(FIGHTING_STYLES).optional(),
    /** A Cleric's Divine Order or a Druid's Primal Order. */
    order: z.enum(CLASS_ORDERS).optional(),
    /** A Warlock's Eldritch Invocation at level 1. */
    invocations: z.array(srdIdSchema).max(1),
    /** The weapons whose mastery a martial class uses. */
    weaponMasteries: z.array(z.enum(WEAPON_IDS)).max(3),
    cantrips: z.array(srdIdSchema).max(5),
    /** The level 1 spells prepared, a Wizard's from the six in its spellbook. */
    spells: z.array(srdIdSchema).max(6),
    /** A Wizard's spellbook: six level 1 spells. */
    spellbook: z.array(srdIdSchema).max(6),
  })
  .strict();
export type CharacterChoices = z.infer<typeof characterChoicesSchema>;

/** A problem the builder finds in the choices: its field and what is wrong, in English. */
export interface ChoiceProblem {
  readonly field: string;
  /** English with `{placeholders}` the client words in its language. */
  readonly message: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** A character built from the choices, played by a player or kept by the DM to invite one. */
export const createCharacterCommandSchema = z
  .object({
    type: z.literal('CreateCharacter'),
    name: entityNameSchema,
    choices: characterChoicesSchema,
    /** Its player; absent: the DM keeps it for an invitation. */
    playerActorId: actorIdSchema.optional(),
    /** Where it enters the world; absent: where the party is. */
    locationId: entityIdSchema.optional(),
  })
  .strict();
