import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';

/**
 * A session's lobby and the table around it (docs/adr/0043-dm-screen.md §6): at the table or
 * online, paused or not, who is here, ready and absent. Table control beside the world; the
 * session's start and end are the World Engine's (`StartSession`, `EndSession`).
 */
export const TABLE_MODES = ['table', 'online'] as const;
export type TableMode = (typeof TABLE_MODES)[number];

export interface LobbyCharacter {
  readonly character: EntityRef;
  /** Its player holds a live subscription. */
  readonly present: boolean;
  /** Its player said "ready" for the session to come (none is open). */
  readonly ready: boolean;
  /** The DM marked its player absent: the DM plays or skips its turns. */
  readonly absent: boolean;
}

/** `GET /campaigns/:campaignId/lobby?perspective=…`: the perspective's own characters. */
export interface LobbyResponse {
  readonly perspective: string;
  readonly mode: TableMode;
  readonly paused: boolean;
  /** The open session; null between sessions. */
  readonly session: { readonly sessionId: string; readonly title: string } | null;
  readonly characters: readonly LobbyCharacter[];
}

/** `POST …/lobby/ready`: a player for their character, or the DM for anyone. */
export const lobbyReadyRequestSchema = z
  .object({ characterId: entityIdSchema, ready: z.boolean() })
  .strict();

/** `POST …/lobby` (DM): the table's mode, a pause, a player absent or back. */
export const lobbyChangeRequestSchema = z
  .object({
    mode: z.enum(TABLE_MODES).optional(),
    paused: z.boolean().optional(),
    absent: z.object({ characterId: entityIdSchema, absent: z.boolean() }).strict().optional(),
  })
  .strict();
