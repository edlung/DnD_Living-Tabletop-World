import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * Handouts (docs/adr/0044-online-play.md §5): what the DM shows one player, or the whole party — a
 * text, a picture of something the recipient knows, or both. Table material beside the world,
 * never world knowledge.
 */
export const HANDOUT_TITLE_MAX = 120;
export const HANDOUT_TEXT_MAX = 2000;
/** The latest handouts a read returns. */
export const HANDOUT_PAGE = 100;

/** `POST /campaigns/:campaignId/handouts` (the DM). */
export const handoutRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(HANDOUT_TITLE_MAX),
    text: z.string().trim().min(1).max(HANDOUT_TEXT_MAX).optional(),
    /** The entity whose approved picture it shows: one the recipient knows. */
    entityId: entityIdSchema.optional(),
    /** The character whose player it is for; absent for the party. */
    recipientId: entityIdSchema.optional(),
  })
  .strict()
  .refine((body) => body.text !== undefined || body.entityId !== undefined, {
    message: 'A handout holds a text, a picture, or both',
  });
export type HandoutRequest = z.infer<typeof handoutRequestSchema>;

export interface HandoutView {
  readonly handoutId: string;
  readonly title: string;
  readonly text: string | null;
  /** The pictured entity, as the reader knows it; null when none (or no longer known). */
  readonly picture: { readonly entityId: string; readonly name: string | null } | null;
  /** For one character (as the reader knows them), or for the party. */
  readonly to: { readonly entityId: string; readonly name: string | null } | 'party';
  readonly at: string;
}

/** `GET /campaigns/:campaignId/handouts?perspective=…`: oldest first. */
export interface HandoutsResponse {
  readonly perspective: string;
  readonly handouts: readonly HandoutView[];
}
