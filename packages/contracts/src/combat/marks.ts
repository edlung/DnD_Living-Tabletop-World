import { z } from 'zod';

import { MAX_BATTLEFIELD, squareSchema, type Square } from './battlefield.ts';

/**
 * Marks the table shares on the board for the live session (docs/adr/0057-encounters-maps-loot.md
 * §5): a ping that fades, the DM's pointer, a stroke until cleared, a spell's area laid for all to
 * see. Kept beside the world, never in it: the live stream only says the marks changed, and each
 * screen reads them again. The DM always marks; players when the DM allows; the DM clears them.
 */
export const MARK_KINDS = ['ping', 'pointer', 'stroke', 'area'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** A ping fades after this long on every screen. */
export const PING_MS = 4_000;
/** Marks a campaign keeps at most: the oldest strokes and areas give way. */
export const MAX_MARKS = 200;

export const markRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ping'), markId: z.uuid(), square: squareSchema }).strict(),
  /** The DM's own: one at a time, moved by laying it again. */
  z.object({ kind: z.literal('pointer'), markId: z.uuid(), square: squareSchema }).strict(),
  z
    .object({
      kind: z.literal('stroke'),
      markId: z.uuid(),
      squares: z.array(squareSchema).min(2).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal('area'),
      markId: z.uuid(),
      squares: z
        .array(squareSchema)
        .min(1)
        .max(MAX_BATTLEFIELD * MAX_BATTLEFIELD),
    })
    .strict(),
]);
export type MarkRequest = z.infer<typeof markRequestSchema>;

export const markSettingsSchema = z.object({ playersMayMark: z.boolean() }).strict();

export interface MarkView {
  readonly markId: string;
  readonly kind: MarkKind;
  /** Whose mark: the DM's, or a player's. */
  readonly by: 'dm' | 'player';
  /** A ping or the pointer: its square. */
  readonly square?: Square;
  /** A stroke's squares in order, or an area's. */
  readonly squares?: readonly Square[];
  readonly createdAt: string;
}

/** `GET /campaigns/:campaignId/marks`: the marks standing now, and whether players may mark. */
export interface MarksResponse {
  readonly perspective: string;
  readonly marks: readonly MarkView[];
  readonly playersMayMark: boolean;
}
