import { z } from 'zod';

/**
 * Cheers at the table (docs/adr/0072-keepsakes.md §3): a player or the DM presses one of a few
 * fixed marks — applause, a laugh — and every screen of the table shows it for a moment. Table
 * talk without words: held in the server's memory for a few seconds and never stored, never
 * canonical, read by no decision. (The word "reaction" is the fight's: ADR 0046.)
 */
export const CHEER_MARKS = ['applause', 'laugh', 'wow', 'fright', 'heart'] as const;
export type CheerMark = (typeof CHEER_MARKS)[number];

/** How long a cheer is held, and so read, after it is given. */
export const CHEER_MS = 6_000;
/** Cheers one campaign holds at once: past it the oldest give way. */
export const MAX_CHEERS = 12;

/** `POST /campaigns/:campaignId/cheers?perspective=…`: the mark, and an ID that makes a retry one cheer. */
export const cheerRequestSchema = z
  .object({ cheerId: z.uuid(), mark: z.enum(CHEER_MARKS) })
  .strict();
export type CheerRequest = z.infer<typeof cheerRequestSchema>;

export interface CheerView {
  readonly cheerId: string;
  readonly mark: CheerMark;
  /** Whose it is, named as the reader knows them; null for the DM's. */
  readonly by: { readonly entityId: string; readonly name: string | null } | null;
}

/** `GET /campaigns/:campaignId/cheers?perspective=…`: the cheers still held, oldest first. */
export interface CheersResponse {
  readonly perspective: string;
  readonly cheers: readonly CheerView[];
}
