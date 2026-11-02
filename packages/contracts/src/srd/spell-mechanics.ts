import { z } from 'zod';

import { ABILITIES, CONDITIONS, DAMAGE_TYPES } from '../rules/character-sheet.ts';
import { srdIdSchema } from './catalog.ts';

/**
 * A spell's mechanics layer (docs/adr/0052-spells-as-data.md §2): what the server computes from,
 * derived from the SRD's text where its wording is regular and curated where it is not
 * (`scripts/srd/spell-mechanics.ts`).
 */
export const spellDiceSchema = z
  .object({
    count: z.number().int().min(1).max(40),
    sides: z.number().int().min(2).max(20),
    bonus: z.number().int().min(-10).max(40),
  })
  .strict();
export type SpellDice = z.infer<typeof spellDiceSchema>;

export const spellDamageSchema = z
  .object({ dice: spellDiceSchema, type: z.enum(DAMAGE_TYPES) })
  .strict();
export type SpellDamage = z.infer<typeof spellDamageSchema>;

export const SPELL_TIME_UNITS = ['action', 'bonus', 'reaction', 'minute', 'hour'] as const;
export const SPELL_RANGE_KINDS = [
  'self',
  'touch',
  'feet',
  'sight',
  'unlimited',
  'miles',
  'special',
] as const;
export const SPELL_AREA_SHAPES = [
  'sphere',
  'cube',
  'cone',
  'line',
  'cylinder',
  'emanation',
] as const;
export type SpellAreaShape = (typeof SPELL_AREA_SHAPES)[number];
export const SPELL_DURATION_UNITS = [
  'instantaneous',
  'round',
  'minute',
  'hour',
  'day',
  'until-dispelled',
  'special',
] as const;

/** What a spell does that the server resolves (§2); `dm`: nothing it computes. */
export const spellEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('attack'),
      attack: z.enum(['melee', 'ranged']),
      damage: z.array(spellDamageSchema).min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal('save'),
      ability: z.enum(ABILITIES),
      damage: z.array(spellDamageSchema).max(3),
      /** A success halves the damage, or takes none. */
      onSuccess: z.enum(['half', 'none']),
      /** A condition a failure brings, for the spell's duration. */
      condition: z.enum(CONDITIONS).nullable(),
      /** The target repeats the save at the end of each of its turns, the spell ending on a success. */
      repeatSave: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('heal'), dice: spellDiceSchema, modifier: z.boolean() }).strict(),
  z.object({ kind: z.literal('temp-hp'), dice: spellDiceSchema }).strict(),
  /** Magic Missile's darts: each hits, its damage rolled once for all. */
  z
    .object({
      kind: z.literal('auto'),
      darts: z.number().int().min(1).max(10),
      damage: spellDamageSchema,
    })
    .strict(),
  z.object({ kind: z.literal('dm') }).strict(),
]);
export type SpellEffect = z.infer<typeof spellEffectSchema>;

export const srdSpellMechanicsSchema = z
  .object({
    spellId: srdIdSchema,
    castingTime: z
      .object({ unit: z.enum(SPELL_TIME_UNITS), amount: z.number().int().min(1).max(24) })
      .strict(),
    range: z
      .object({
        kind: z.enum(SPELL_RANGE_KINDS),
        /** In feet for `feet`, in miles for `miles`. */
        amount: z.number().int().min(1).max(1000).nullable(),
      })
      .strict(),
    area: z
      .object({
        shape: z.enum(SPELL_AREA_SHAPES),
        /** A sphere's or cylinder's radius, a cube's side, a cone's or line's length, an emanation's reach. */
        sizeFt: z.number().int().min(5).max(500),
        /** A line's width. */
        widthFt: z.number().int().min(5).max(60).nullable(),
        /** Centered on a point within range, or starting from the caster. */
        origin: z.enum(['point', 'self']),
      })
      .strict()
      .nullable(),
    /** How many creatures it targets when it names them one by one. */
    targets: z.number().int().min(1).max(12).nullable(),
    duration: z
      .object({
        unit: z.enum(SPELL_DURATION_UNITS),
        amount: z.number().int().min(1).max(30).nullable(),
      })
      .strict(),
    concentration: z.boolean(),
    ritual: z.boolean(),
    effect: spellEffectSchema,
    /** A higher slot's gain for each level above the spell's (§3). */
    upcast: z
      .object({
        dice: spellDiceSchema.nullable(),
        /** The damage type the dice add to, when the spell deals several. */
        damageType: z.enum(DAMAGE_TYPES).nullable(),
        targets: z.number().int().min(1).max(5).nullable(),
        darts: z.number().int().min(1).max(5).nullable(),
      })
      .strict()
      .nullable(),
    /** A cantrip's growth at levels 5, 11 and 17: its dice, or its beams (attacks). */
    cantrip: z.enum(['dice', 'beams']).nullable(),
    /** The slice's own engine code casts it (ADR 0015, 0016, 0046), not this data. */
    slice: z.boolean(),
    /** The effect is all the spell does; otherwise the DM applies the rest (§2). */
    complete: z.boolean(),
  })
  .strict();
export type SrdSpellMechanics = z.infer<typeof srdSpellMechanicsSchema>;
