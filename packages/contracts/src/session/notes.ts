import { z } from 'zod';

/**
 * A hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5). Table data
 * beside the world, never canonical: no World Engine decision reads either. A backstory is the
 * hero's — read and written by the character's player and by the DM, and by nobody else. A private
 * note is the person's who wrote it, as the character they play — read by nobody else, the DM
 * included.
 */
export const BACKSTORY_CHARS = 4000;
export const NOTE_TITLE_CHARS = 120;
export const NOTE_BODY_CHARS = 4000;
/** Private notes one player keeps for one character at most. */
export const MAX_PLAYER_NOTES = 50;

/** `POST …/entities/:entityId/backstory?perspective=…`: the whole text; empty takes it away. */
export const backstoryRequestSchema = z
  .object({ body: z.string().trim().max(BACKSTORY_CHARS) })
  .strict();
export type BackstoryRequest = z.infer<typeof backstoryRequestSchema>;

/** `GET …/entities/:entityId/backstory?perspective=…`: its player's and the DM's to read. */
export interface BackstoryResponse {
  readonly perspective: string;
  readonly characterId: string;
  /** The empty string while nothing is written. */
  readonly body: string;
  /** Who wrote it last; null while nothing is written. */
  readonly writtenBy: 'player' | 'dm' | null;
  readonly updatedAt: string | null;
}

/**
 * `POST …/notes?perspective=…`: a note written or changed. The ID is the client's, so a retried
 * request is the same note.
 */
export const playerNoteRequestSchema = z
  .object({
    noteId: z.uuid(),
    title: z.string().trim().max(NOTE_TITLE_CHARS),
    body: z.string().trim().max(NOTE_BODY_CHARS),
  })
  .strict()
  .refine((note) => note.title !== '' || note.body !== '', 'a note holds something');
export type PlayerNoteRequest = z.infer<typeof playerNoteRequestSchema>;

export interface PlayerNoteView {
  readonly noteId: string;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: string;
}

/** `GET …/notes?perspective=…`: the reader's own notes as that character, the latest first. */
export interface PlayerNotesResponse {
  readonly perspective: string;
  readonly notes: readonly PlayerNoteView[];
  /** Whether one more may be written. */
  readonly room: boolean;
}
