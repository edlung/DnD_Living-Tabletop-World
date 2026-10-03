import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Combat commands (docs/adr/0015-combat-engine.md). Schemas validate shape
 * only; legality is decided by the Rules Engine through the World Engine.
 */
export const COVER_LEVELS = ['half', 'three-quarters', 'total'] as const;
export type CoverLevel = (typeof COVER_LEVELS)[number];
export const SIDES = ['party', 'hostile', 'neutral'] as const;
export type Side = (typeof SIDES)[number];

export const MAX_BATTLEFIELD = 40;
export const MAX_COMBATANTS = 16;

export const squareSchema = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(MAX_BATTLEFIELD - 1),
    y: z
      .number()
      .int()
      .min(0)
      .max(MAX_BATTLEFIELD - 1),
  })
  .strict();
export type Square = z.infer<typeof squareSchema>;

export const battlefieldSchema = z
  .object({
    width: z.number().int().min(1).max(MAX_BATTLEFIELD),
    height: z.number().int().min(1).max(MAX_BATTLEFIELD),
    difficult: z.array(squareSchema).max(400),
    cover: z
      .array(
        z
          .object({ x: squareSchema.shape.x, y: squareSchema.shape.y, level: z.enum(COVER_LEVELS) })
          .strict(),
      )
      .max(400),
  })
  .strict();
export type Battlefield = z.infer<typeof battlefieldSchema>;

export const startCombatCommandSchema = z
  .object({
    type: z.literal('StartCombat'),
    encounterId: entityIdSchema.optional(),
    locationId: entityIdSchema,
    battlefield: battlefieldSchema,
    combatants: z
      .array(
        z
          .object({ entityId: entityIdSchema, side: z.enum(SIDES), position: squareSchema })
          .strict(),
      )
      .min(2)
      .max(MAX_COMBATANTS),
  })
  .strict();

export const moveCombatantCommandSchema = z
  .object({
    type: z.literal('MoveCombatant'),
    combatantId: entityIdSchema,
    /** Squares entered, in order, starting next to the current square. */
    path: z.array(squareSchema).min(1).max(40),
  })
  .strict();

export const attackCommandSchema = z
  .object({
    type: z.literal('Attack'),
    combatantId: entityIdSchema,
    /** A character weapon (`longbow`) or a stat-block attack ID. */
    attackId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48),
    targetId: entityIdSchema,
  })
  .strict();

export const castSpellCommandSchema = z
  .object({
    type: z.literal('CastSpell'),
    combatantId: entityIdSchema,
    /** A slice spell (ADR 0011) or a stat-block spell ID. */
    spellId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(48),
    /** Characters: a slot level or a slot-free cast; omitted = free first, then the lowest slot. */
    using: z
      .union([z.literal('free'), z.object({ slotLevel: z.number().int().min(1).max(9) }).strict()])
      .optional(),
    targetId: entityIdSchema.optional(),
    /** Fireball's point, or Misty Step's destination. */
    point: squareSchema.optional(),
  })
  .strict();

export const endTurnCommandSchema = z
  .object({ type: z.literal('EndTurn'), combatantId: entityIdSchema })
  .strict();

export const endCombatCommandSchema = z
  .object({ type: z.literal('EndCombat'), encounterId: entityIdSchema })
  .strict();

/** Combat commands a player may issue for their own character. */
export const PLAYER_COMBAT_COMMAND_TYPES = [
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'EndTurn',
] as const;
/** Every combat command decided by the combat engine (through the World Engine's port). */
export const COMBAT_COMMAND_TYPES = [
  'StartCombat',
  'MoveCombatant',
  'Attack',
  'CastSpell',
  'EndTurn',
  'EndCombat',
] as const;
export type CombatCommandType = (typeof COMBAT_COMMAND_TYPES)[number];
