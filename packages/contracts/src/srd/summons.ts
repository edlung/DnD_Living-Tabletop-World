import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * The creatures four spells summon, their stat blocks scaled by the spell's level
 * (docs/adr/0056-characters-from-the-srd.md §5): Find Steed's Otherworldly Steed, Giant Insect's,
 * Summon Dragon's Draconic Spirit and Animate Objects' Animated Object. The caster chooses what the
 * spell lets them choose; the World Engine builds the block from the SRD's numbers.
 */
export const SUMMONED_CREATURES = [
  'otherworldly-steed',
  'giant-insect',
  'draconic-spirit',
  'animated-object',
] as const;
export type SummonedCreature = (typeof SUMMONED_CREATURES)[number];

/** The steed's creature type, which gives its Slam's damage. */
export const STEED_TYPES = ['celestial', 'fey', 'fiend'] as const;
/** The insect's form: a spider's Web Bolt, a wasp's flight. */
export const INSECT_FORMS = ['centipede', 'spider', 'wasp'] as const;
/** The spirit's Breath Weapon, one of its Resistances. */
export const DRAGON_BREATHS = ['acid', 'cold', 'fire', 'lightning', 'poison'] as const;
/** What each creature lets the caster choose; the animated objects are chosen by size instead. */
export const SUMMON_OPTIONS = {
  'otherworldly-steed': STEED_TYPES,
  'giant-insect': INSECT_FORMS,
  'draconic-spirit': DRAGON_BREATHS,
  'animated-object': [],
} as const satisfies Readonly<Record<SummonedCreature, readonly string[]>>;
export type SummonOption =
  (typeof STEED_TYPES)[number] | (typeof INSECT_FORMS)[number] | (typeof DRAGON_BREATHS)[number];

/**
 * Animate Objects' sizes: a Medium or smaller object counts as one against the caster's
 * spellcasting modifier, a Large as two, a Huge as three.
 */
export const ANIMATED_SIZES = ['medium', 'large', 'huge'] as const;
export type AnimatedSize = (typeof ANIMATED_SIZES)[number];
export const ANIMATED_WEIGHT: Readonly<Record<AnimatedSize, number>> = {
  medium: 1,
  large: 2,
  huge: 3,
};

const count = z.number().int().min(0).max(9);

/** The caster's choice on `CastSpell`: the creature's option, or the objects to animate. */
export const summonChoiceSchema = z
  .object({
    option: z.enum([...STEED_TYPES, ...INSECT_FORMS, ...DRAGON_BREATHS]).optional(),
    objects: z.object({ medium: count, large: count, huge: count }).strict().optional(),
  })
  .strict();
export type SummonChoice = z.infer<typeof summonChoiceSchema>;

/**
 * Who summoned a creature, with which spell and choice: its block's mark. It goes when the spell
 * ends or its caster dies, and does not come back to life.
 */
export const summonedSchema = z
  .object({
    by: entityIdSchema,
    spellId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48),
    creature: z.enum(SUMMONED_CREATURES),
    option: z.enum([...STEED_TYPES, ...INSECT_FORMS, ...DRAGON_BREATHS]).optional(),
  })
  .strict();
export type Summoned = z.infer<typeof summonedSchema>;
