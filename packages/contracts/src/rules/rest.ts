import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { CLASS_IDS } from './character-sheet.ts';

/**
 * Rests and milestone levels at the table (Stage 530, docs/PRODUCT_COMPLETION_PLAN.md decision 9).
 * The DM calls a rest or grants a level; a player spends Hit Point Dice in an open short rest. The
 * server's rules compute every sheet and the World Engine records it; `requestId` makes a retried
 * request answer as done instead of resting twice.
 */
const requestId = z.uuid();

/** POST …/rest (DM): a short rest opens for an hour of world time, a long one takes eight hours. */
export const restRequestSchema = z.object({ requestId, kind: z.enum(['short', 'long']) }).strict();
export type RestRequest = z.infer<typeof restRequestSchema>;

/** POST …/rest/end (DM): the open short rest ends. */
export const restEndRequestSchema = z.object({ requestId }).strict();

/** POST …/rest/hit-die (the character's player, or the DM): one Hit Point Die, rolled by the server. */
export const hitDieRequestSchema = z
  .object({
    requestId,
    characterId: entityIdSchema,
    sides: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    /** The face of the player's own die, where the campaign lets them enter it (ADR 0044 §4). */
    face: z.number().int().min(1).max(12).optional(),
  })
  .strict();
export type HitDieRequest = z.infer<typeof hitDieRequestSchema>;

/** POST …/characters/:characterId/level-up (DM): a milestone level in one of its classes. */
export const levelUpRequestSchema = z.object({ requestId, classId: z.enum(CLASS_IDS) }).strict();
export type LevelUpRequest = z.infer<typeof levelUpRequestSchema>;

/** The open short rest, as everyone at the table sees it. */
export interface RestView {
  readonly restId: string;
  readonly kind: 'short';
  /** ISO wall-clock time it opened. */
  readonly startedAt: string;
}

/** GET …/rest: the open short rest, if any (none while a fight runs). */
export interface RestResponse {
  readonly perspective: string;
  readonly rest: RestView | null;
}

/** What a rest request did; `duplicate` when this `requestId` was already done. */
export type RestResult =
  | { readonly status: 'rested' | 'resting' | 'ended' | 'levelled' | 'duplicate' }
  | { readonly status: 'healed'; readonly healed: number };
