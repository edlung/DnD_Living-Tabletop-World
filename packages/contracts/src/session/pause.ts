import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * A player's quiet request for a pause (docs/adr/0073-table-ideas.md §2): one press tells the DM
 * alone. Held in the server's memory until the DM has seen it, the game is paused or it has aged
 * out — never stored, never in chat, never canonical, and read by nobody but the DM and the one
 * who asked. It pauses nothing by itself: the DM decides.
 */

/** How long a request the DM has not answered is held. */
export const PAUSE_ASK_MS = 10 * 60_000;
/** How long the asker goes on reading that the DM has seen it; then the request is gone. */
export const PAUSE_SEEN_MS = 60_000;
/** A character asks once in this long: a second press, or a drumming thumb, changes nothing. */
export const PAUSE_AGAIN_MS = 60_000;

/** `POST /campaigns/:campaignId/pause-requests?perspective=…`: a player, as their own character. */
export const pauseAskRequestSchema = z.object({}).strict();

/** `POST …/pause-requests/answer?perspective=DM`: the DM has seen that character's request. */
export const pauseAnswerRequestSchema = z.object({ characterId: entityIdSchema }).strict();
export type PauseAnswerRequest = z.infer<typeof pauseAnswerRequestSchema>;

export interface PauseAskView {
  /** Who asks, named as the reader knows them. */
  readonly character: { readonly entityId: string; readonly name: string | null };
  /** The DM has seen it (or paused the game): the asker reads so for a moment. */
  readonly seen: boolean;
}

/**
 * `GET /campaigns/:campaignId/pause-requests?perspective=…`: every request for the DM; a
 * character's own, if any, for its player. No other perspective reads any.
 */
export interface PauseAsksResponse {
  readonly perspective: string;
  readonly asks: readonly PauseAskView[];
}
