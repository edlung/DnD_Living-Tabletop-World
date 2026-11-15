import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { sessionIdSchema } from '../memory/commands.ts';

/**
 * Stars and wishes at an evening's end (docs/adr/0071-memory-and-ritual.md §2): each player names
 * a star (what they liked) and a wish (what they want next time), the DM too. Table data beside
 * the world, never canonical. Everyone at the table reads the stars; a wish is read by its author
 * and the DM. They are written between sessions, for the session that ended last.
 */
export const REFLECTION_CHARS = 280;
/** How many ended sessions a read lists, newest first. */
export const REFLECTION_SESSIONS = 20;

const words = z.string().trim().max(REFLECTION_CHARS);

/** `POST /campaigns/:campaignId/reflections?perspective=…`: both empty takes the entry away. */
export const reflectionRequestSchema = z
  .object({
    sessionId: sessionIdSchema,
    /** Whose words: a character's; null for the DM's own. */
    characterId: entityIdSchema.nullable(),
    star: words,
    wish: words,
  })
  .strict();
export type ReflectionRequest = z.infer<typeof reflectionRequestSchema>;

export interface ReflectionView {
  /** Whose words, named as the reader knows them; null for the DM. */
  readonly author: { readonly entityId: string; readonly name: string | null } | null;
  /** Read by everyone at the table; empty when only a wish was written. */
  readonly star: string;
  /** Read by its author and the DM; null for anyone else. */
  readonly wish: string | null;
  /** The reader may change it: their own character's, or anyone's for the DM. */
  readonly own: boolean;
}

export interface SessionReflections {
  readonly sessionId: string;
  readonly title: string;
  /** Stars and wishes may still be written: it ended last and no session has started since. */
  readonly open: boolean;
  readonly entries: readonly ReflectionView[];
}

/** `GET /campaigns/:campaignId/reflections?perspective=…`: ended sessions, newest first. */
export interface ReflectionsResponse {
  readonly perspective: string;
  readonly sessions: readonly SessionReflections[];
}
