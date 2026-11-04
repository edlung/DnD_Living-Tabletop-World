import { z } from 'zod';

import { ABILITIES } from '../rules/character-sheet.ts';
import type { TrapId } from './toolbox.ts';

/**
 * The board's own vocabulary (docs/adr/0015-combat-engine.md §3; ADR 0049; ADR 0050): cover and
 * sides, a square, the light, and the battlefield with its terrain.
 */
export const COVER_LEVELS = ['half', 'three-quarters', 'total'] as const;
export type CoverLevel = (typeof COVER_LEVELS)[number];
export const SIDES = ['party', 'hostile', 'neutral'] as const;
export type Side = (typeof SIDES)[number];

export const MAX_BATTLEFIELD = 40;
/** Fights larger than the slice's 16 (docs/adr/0043-dm-screen.md §2). */
export const MAX_COMBATANTS = 40;

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

/**
 * Traps on the board (docs/adr/0057-encounters-maps-loot.md §6): the Gameplay Toolbox's example
 * traps (ADR 0055 §4) but the Poisoned Needle, which waits in a lock, not on a floor. One trap lies
 * over the squares of the DM's stroke; a creature entering any of them at ground level springs it.
 */
export const BOARD_TRAP_IDS = [
  'collapsing-roof',
  'falling-net',
  'fire-casting-statue',
  'hidden-pit',
  'poisoned-darts',
  'rolling-stone',
  'spiked-pit',
] as const satisfies readonly TrapId[];
export type BoardTrapId = (typeof BOARD_TRAP_IDS)[number];
export const MAX_TRAP_SQUARES = 64;

export const boardTrapSchema = z
  .object({
    trapId: z.enum(BOARD_TRAP_IDS),
    /** The tier by the characters' levels, as `SpringTrap` takes it (1: levels 1–4). */
    tier: z.number().int().min(1).max(4),
    /** Its squares, by row then column. */
    squares: z.array(squareSchema).min(1).max(MAX_TRAP_SQUARES),
    /** Set hidden: the players and the display see it once found or sprung. */
    hidden: z.boolean(),
    /** The party found it, or saw it spring. */
    found: z.literal(true).optional(),
    /** Disarmed: it springs no more. */
    disarmed: z.literal(true).optional(),
    /** How often it sprang, and in which turn last: one that resets waits for the next turn. */
    springs: z.number().int().min(1).max(99).optional(),
    lastSprung: z
      .object({ round: z.number().int().min(0), turn: z.number().int().min(-1) })
      .strict()
      .optional(),
  })
  .strict();
export type BoardTrap = z.infer<typeof boardTrapSchema>;

/**
 * Harmful ground (ADR 0057 §6): fire, acid or a poison cloud on a square harms a creature that
 * enters it or starts its turn there, with the save the DM set — none or half on a success.
 */
export const BOARD_HAZARDS = ['fire', 'acid', 'poison'] as const;
export type BoardHazardKind = (typeof BOARD_HAZARDS)[number];
export const boardHazardSchema = z
  .object({
    kind: z.enum(BOARD_HAZARDS),
    dice: z
      .object({
        count: z.number().int().min(1).max(20),
        sides: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
      })
      .strict(),
    ability: z.enum(ABILITIES),
    dc: z.number().int().min(5).max(30),
    onSuccess: z.enum(['none', 'half']),
  })
  .strict();
export type BoardHazard = z.infer<typeof boardHazardSchema>;

/** Bright Light, Dim Light, Darkness (docs/adr/0050-the-world-around.md §1). */
export const LIGHT_LEVELS = ['bright', 'dim', 'dark'] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

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
    /** Squares no one stands in or crosses (docs/adr/0049-space-and-movement.md §4). */
    walls: z.array(squareSchema).max(800).optional(),
    /** Water, swum (§5); deep water immerses who is in it (§11). */
    water: z
      .array(
        z
          .object({
            x: squareSchema.shape.x,
            y: squareSchema.shape.y,
            deep: z.literal(true).optional(),
          })
          .strict(),
      )
      .max(800)
      .optional(),
    /** The ground's height in feet, raised (a ledge, a roof) or sunk (a pit); absent: 0 (§6). */
    ground: z
      .array(
        z
          .object({
            x: squareSchema.shape.x,
            y: squareSchema.shape.y,
            ft: z.number().int().min(-200).max(200).multipleOf(5),
          })
          .strict(),
      )
      .max(800)
      .optional(),
    /**
     * Its light (docs/adr/0050-the-world-around.md §1): the light everywhere, Bright when absent,
     * and squares lit otherwise — a torch's circle, a dark corner.
     */
    ambient: z.enum(LIGHT_LEVELS).optional(),
    light: z
      .array(
        z
          .object({
            x: squareSchema.shape.x,
            y: squareSchema.shape.y,
            level: z.enum(LIGHT_LEVELS),
          })
          .strict(),
      )
      .max(800)
      .optional(),
    /** Fog, foliage, smoke: lightly obscured squares, or heavily with `heavy` (§1). */
    obscured: z
      .array(
        z
          .object({
            x: squareSchema.shape.x,
            y: squareSchema.shape.y,
            heavy: z.literal(true).optional(),
          })
          .strict(),
      )
      .max(800)
      .optional(),
    /**
     * The fog of war (docs/adr/0057-encounters-maps-loot.md §4): squares the DM hides from the
     * players and the table's display — what stands there and its ground — except the party's own.
     */
    fog: z
      .array(squareSchema)
      .max(MAX_BATTLEFIELD * MAX_BATTLEFIELD)
      .optional(),
    /** Its traps and its harmful ground (docs/adr/0057-encounters-maps-loot.md §6). */
    traps: z.array(boardTrapSchema).max(40).optional(),
    hazards: z
      .array(
        z
          .object({ x: squareSchema.shape.x, y: squareSchema.shape.y, hazard: boardHazardSchema })
          .strict(),
      )
      .max(400)
      .optional(),
  })
  .strict();
export type Battlefield = z.infer<typeof battlefieldSchema>;
