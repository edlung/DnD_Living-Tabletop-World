import { z } from 'zod';

import type { CampaignOptions } from '../campaign/options.ts';
import { musicChangeSchema } from '../display/music.ts';
import { ambienceChoiceSchema, type TableSound } from '../display/sound.ts';
import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';

/**
 * A session's lobby and the table around it (docs/adr/0043-dm-screen.md §6): at the table or
 * online, paused or not, who is here, ready and absent. Table control beside the world; the
 * session's start and end are the World Engine's (`StartSession`, `EndSession`).
 */
export const TABLE_MODES = ['table', 'online'] as const;
export type TableMode = (typeof TABLE_MODES)[number];

/** The campaign's dice (docs/adr/0044-online-play.md §4): the app's, or the players' own entered. */
export const TABLE_DICE = ['app', 'physical'] as const;
export type TableDice = (typeof TABLE_DICE)[number];

/**
 * A campaign played on another server since a move took it there (docs/adr/0061-local-mode.md §5):
 * here it is read, not played, until it comes back.
 */
export interface CampaignAway {
  /** Where it plays, in the operator's words (a computer's or a server's name). */
  readonly destination: string;
  readonly movedAt: string;
}

/** How long the DM's line about the next game may be ("at Grandma's"). */
export const NEXT_GAME_NOTE_CHARS = 120;

/**
 * The next game (docs/adr/0071-memory-and-ritual.md §3): when the table meets again. Table data
 * the DM sets; every member and a table display read it.
 */
export interface NextGame {
  /** The instant it begins (ISO 8601, UTC); each screen shows it in its own time zone. */
  readonly at: string;
  readonly note: string;
}

/**
 * "I'll come / I can't" for the next game (docs/adr/0073-table-ideas.md §10): one answer a
 * character for the date as it stands. Table data; a changed date asks again.
 */
export const COMING_ANSWERS = ['yes', 'no'] as const;
export type ComingAnswer = (typeof COMING_ANSWERS)[number];

export interface LobbyCharacter {
  readonly character: EntityRef;
  /** Its player holds a live subscription. */
  readonly present: boolean;
  /** Its player said "ready" for the session to come (none is open). */
  readonly ready: boolean;
  /** The DM marked its player absent: the DM plays or skips its turns. */
  readonly absent: boolean;
  /** Whether they come to the next game; null without an answer, or without a date (ADR 0073 §10). */
  readonly coming: ComingAnswer | null;
}

/** `GET /campaigns/:campaignId/lobby?perspective=…`: the perspective's own characters. */
export interface LobbyResponse {
  readonly perspective: string;
  readonly mode: TableMode;
  readonly paused: boolean;
  /** Whether players may enter the faces of their own dice. */
  readonly dice: TableDice;
  /** The open session; null between sessions. */
  readonly session: { readonly sessionId: string; readonly title: string } | null;
  readonly characters: readonly LobbyCharacter[];
  /** The campaign's options, the World Engine's (docs/adr/0056-characters-from-the-srd.md §3). */
  readonly options: CampaignOptions;
  /** What the table hears (docs/adr/0059-atmosphere.md). */
  readonly sound: TableSound;
  /** Played on another server since a move; null at home (docs/adr/0061-local-mode.md §5). */
  readonly away: CampaignAway | null;
  /** When the table meets again; null when no date is set or it has passed (ADR 0071 §3). */
  readonly nextGame: NextGame | null;
}

/** `POST …/lobby/ready`: a player for their character, or the DM for anyone. */
export const lobbyReadyRequestSchema = z
  .object({ characterId: entityIdSchema, ready: z.boolean() })
  .strict();

/**
 * `POST …/lobby/coming`: a player for their character, or the DM for anyone (a child who said it
 * aloud); null takes the answer back.
 */
export const lobbyComingRequestSchema = z
  .object({ characterId: entityIdSchema, coming: z.enum(COMING_ANSWERS).nullable() })
  .strict();

/** `POST …/lobby` (DM): the table's mode, a pause, a player absent or back. */
export const lobbyChangeRequestSchema = z
  .object({
    mode: z.enum(TABLE_MODES).optional(),
    paused: z.boolean().optional(),
    dice: z.enum(TABLE_DICE).optional(),
    absent: z.object({ characterId: entityIdSchema, absent: z.boolean() }).strict().optional(),
    /** The table's ambience: one, none, or by the scene (ADR 0059 §1). */
    ambience: ambienceChoiceSchema.optional(),
    /** The DM's music: a track played, paused, resumed or stopped (ADR 0059 §3). */
    music: musicChangeSchema.optional(),
    /** The next game: a date with a line about it, or null to take it away (ADR 0071 §3). */
    nextGame: z
      .object({
        at: z.iso.datetime(),
        note: z.string().trim().max(NEXT_GAME_NOTE_CHARS).default(''),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
