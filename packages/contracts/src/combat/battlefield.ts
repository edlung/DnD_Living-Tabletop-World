import { z } from 'zod';

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
  })
  .strict();
export type Battlefield = z.infer<typeof battlefieldSchema>;
