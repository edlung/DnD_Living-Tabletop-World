import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { COVER_LEVELS, squareSchema } from './battlefield.ts';

/**
 * The DM's hand on a running fight's board (docs/adr/0057-encounters-maps-loot.md §2): a
 * combatant set down on a free square — no movement spent, no opportunity attack, a rider carried
 * with its mount — by choosing it and its square or by dragging its token.
 */
export const placeCombatantCommandSchema = z
  .object({
    type: z.literal('PlaceCombatant'),
    combatantId: entityIdSchema,
    position: squareSchema,
  })
  .strict();

/**
 * A stroke of the DM's brush on a running fight's ground (docs/adr/0057-encounters-maps-loot.md
 * §2): a wall, difficult ground, cover, water, a height, obscurement, or the square cleared. Each
 * replaces what lay there of its own kind; a wall replaces everything, and anything else laid on
 * a wall's square takes the wall away.
 */
export const terrainPaintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wall') }).strict(),
  z.object({ kind: z.literal('difficult') }).strict(),
  z.object({ kind: z.literal('cover'), level: z.enum(COVER_LEVELS) }).strict(),
  z.object({ kind: z.literal('water'), deep: z.boolean() }).strict(),
  /** The ground's height in feet; 0 lays it level again (docs/adr/0049-space-and-movement.md §6). */
  z
    .object({
      kind: z.literal('ground'),
      ft: z.number().int().min(-200).max(200).multipleOf(5),
    })
    .strict(),
  z.object({ kind: z.literal('obscured'), heavy: z.boolean() }).strict(),
  z.object({ kind: z.literal('clear') }).strict(),
]);
export type TerrainPaint = z.infer<typeof terrainPaintSchema>;
export const TERRAIN_PAINT_KINDS = [
  'wall',
  'difficult',
  'cover',
  'water',
  'ground',
  'obscured',
  'clear',
] as const satisfies readonly TerrainPaint['kind'][];

/** Squares a stroke covers at most: a dragged line or a filled room. */
export const MAX_PAINTED_SQUARES = 400;

export const paintTerrainCommandSchema = z
  .object({
    type: z.literal('PaintTerrain'),
    squares: z.array(squareSchema).min(1).max(MAX_PAINTED_SQUARES),
    paint: terrainPaintSchema,
  })
  .strict();
