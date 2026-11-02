import { z } from 'zod';

/**
 * The SRD 5.2.1 catalogs' text layer (docs/adr/0051-srd-data.md §2–3), as `scripts/srd/import.ts`
 * writes them into `@ltw/rules`: what the SRD says of each spell and stat block, English, read
 * only. The mechanics the server computes from come in a layer of their own.
 */
export const SRD_SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;
export type SrdSchool = (typeof SRD_SCHOOLS)[number];

/** The classes whose spell lists the SRD's spells name. */
export const SRD_SPELL_LISTS = [
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
] as const;
export type SrdSpellList = (typeof SRD_SPELL_LISTS)[number];

/** A catalog id: the entry's name as a slug ("Hunter's Mark" → `hunters-mark`). */
export const srdIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(64);

const line = z.string().min(1).max(400);
const prose = z.string().min(1).max(8000);

export const srdSpellSchema = z
  .object({
    spellId: srdIdSchema,
    name: z.string().min(1).max(64),
    level: z.number().int().min(0).max(9),
    school: z.enum(SRD_SCHOOLS),
    classes: z.array(z.enum(SRD_SPELL_LISTS)).min(1).max(SRD_SPELL_LISTS.length),
    castingTime: line,
    ritual: z.boolean(),
    range: line,
    components: z
      .object({
        verbal: z.boolean(),
        somatic: z.boolean(),
        material: line.nullable(),
        /** The material's cost in gold pieces, when it names one. */
        costGp: z.number().min(0).nullable(),
        consumed: z.boolean(),
      })
      .strict(),
    duration: line,
    concentration: z.boolean(),
    description: prose,
    higherLevels: prose.nullable(),
  })
  .strict();
export type SrdSpell = z.infer<typeof srdSpellSchema>;

/** A stat block's named entry: a trait, an action, a reaction ("Bite.", its text). */
export const srdEntrySchema = z.object({ name: z.string().min(1).max(80), text: prose }).strict();
export type SrdEntry = z.infer<typeof srdEntrySchema>;

const abilityLineSchema = z
  .object({
    score: z.number().int().min(1).max(30),
    modifier: z.number().int().min(-5).max(10),
    save: z.number().int().min(-5).max(20),
  })
  .strict();

/** Challenge ratings the SRD uses: 0, ⅛, ¼, ½ and 1–30. */
export const SRD_CHALLENGE_PATTERN = /^(0|1\/8|1\/4|1\/2|[1-9]|[12]\d|30)$/;

export const srdMonsterSchema = z
  .object({
    monsterId: srdIdSchema,
    name: z.string().min(1).max(64),
    /** "Medium", or a choice: "Medium or Small". */
    size: z
      .string()
      .regex(
        /^(Tiny|Small|Medium|Large|Huge|Gargantuan)( or (Tiny|Small|Medium|Large|Huge|Gargantuan))?$/,
      ),
    /** "Dragon (Chromatic)", "Swarm of Tiny Beasts". */
    type: line,
    alignment: line,
    armorClass: z.number().int().min(1).max(30),
    initiative: z
      .object({
        modifier: z.number().int().min(-5).max(20),
        score: z.number().int().min(5).max(30),
      })
      .strict(),
    hitPoints: z.object({ average: z.number().int().min(1).max(1000), dice: line }).strict(),
    speed: line,
    abilities: z
      .object({
        str: abilityLineSchema,
        dex: abilityLineSchema,
        con: abilityLineSchema,
        int: abilityLineSchema,
        wis: abilityLineSchema,
        cha: abilityLineSchema,
      })
      .strict(),
    skills: line.nullable(),
    vulnerabilities: line.nullable(),
    resistances: line.nullable(),
    immunities: line.nullable(),
    gear: line.nullable(),
    senses: line,
    languages: line,
    challenge: z
      .object({
        rating: z.string().regex(SRD_CHALLENGE_PATTERN),
        xp: z.number().int().min(0).max(200_000),
        /** The XP in its lair, when the block names one. */
        xpInLair: z.number().int().min(0).max(200_000).nullable(),
        proficiency: z.number().int().min(2).max(9),
      })
      .strict(),
    traits: z.array(srdEntrySchema).max(20),
    actions: z.array(srdEntrySchema).max(20),
    bonusActions: z.array(srdEntrySchema).max(20),
    reactions: z.array(srdEntrySchema).max(20),
    legendary: z
      .object({ uses: prose, entries: z.array(srdEntrySchema).min(1).max(10) })
      .strict()
      .nullable(),
  })
  .strict();
export type SrdMonster = z.infer<typeof srdMonsterSchema>;
