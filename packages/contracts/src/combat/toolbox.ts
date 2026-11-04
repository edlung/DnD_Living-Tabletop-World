import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { CONTAGION_IDS } from '../rules/contagions.ts';

/**
 * The Gameplay Toolbox at the table (docs/adr/0055-rules-reference-and-toolbox.md §4): the DM
 * springs one of the SRD's example traps on the creatures it catches, or puts them under mental
 * stress; the World Engine rolls every save and every die, in a fight or out of one.
 */
export const TRAP_IDS = [
  'collapsing-roof',
  'falling-net',
  'fire-casting-statue',
  'hidden-pit',
  'poisoned-darts',
  'poisoned-needle',
  'rolling-stone',
  'spiked-pit',
] as const;
export type TrapId = (typeof TRAP_IDS)[number];

const caught = z
  .array(entityIdSchema)
  .min(1)
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'A creature is caught once');

export const springTrapCommandSchema = z
  .object({
    type: z.literal('SpringTrap'),
    trapId: z.enum(TRAP_IDS),
    /** The tier by the characters' levels: 1 (levels 1–4) to 4 (17–20); a trap may have fewer. */
    tier: z.number().int().min(1).max(4),
    targetIds: caught,
  })
  .strict();

/**
 * Mental stress (the Toolbox's sample effects): Psychic damage in d6s, and a save — Wisdom, or
 * Intelligence or Charisma where it fits better — for none of it or for half, as the DM chooses.
 */
export const inflictMentalStressCommandSchema = z
  .object({
    type: z.literal('InflictMentalStress'),
    targetIds: caught,
    ability: z.enum(['int', 'wis', 'cha']),
    dc: z.number().int().min(5).max(30),
    /** How many d6 of Psychic damage: 1, 3 and 9 in the sample effects. */
    dice: z.number().int().min(1).max(20),
    onSuccess: z.enum(['none', 'half']),
  })
  .strict();

/**
 * A magical contagion (the Toolbox's examples): the DM infects a character — a save first where the
 * contagion names one — then follows its course: it takes hold (its Exhaustion), the character
 * fights it (the save at a Long Rest's end or at dawn, rolled by the World Engine), or it ends.
 */
export const infectWithContagionCommandSchema = z
  .object({
    type: z.literal('InfectWithContagion'),
    targetId: entityIdSchema,
    contagionId: z.enum(CONTAGION_IDS),
  })
  .strict();

export const CONTAGION_STEPS = ['takes-hold', 'fight', 'cure'] as const;
export type ContagionStep = (typeof CONTAGION_STEPS)[number];
export const contagionCourseCommandSchema = z
  .object({
    type: z.literal('ContagionCourse'),
    targetId: entityIdSchema,
    contagionId: z.enum(CONTAGION_IDS),
    step: z.enum(CONTAGION_STEPS),
  })
  .strict();

export const TOOLBOX_COMMAND_TYPES = [
  'SpringTrap',
  'InflictMentalStress',
  'InfectWithContagion',
  'ContagionCourse',
] as const;
