import { z } from 'zod';

import { campaignBookSchema } from './book.ts';
import { campaignKeySchema } from './story.ts';

/**
 * The DM's book as the DM's screen reads it (docs/adr/0074-dm-book.md §3): the book, what its
 * keys are in this campaign's world, and the DM's own place in it. Served to the DM alone.
 */

/**
 * The DM's place in the book: where the party is (the ribbon), the chapters played, the DM's own
 * notes on a page. The DM's state beside the world — never world state, never a player's to see.
 */
export const BOOK_NOTE_CHARS = 2000;
export const MAX_BOOK_NOTES = 200;
export const bookPlaceSchema = z
  .object({
    /** A chapter's key (its opening) or a page's key; null before the book was first read. */
    ribbon: campaignKeySchema.nullable(),
    played: z.array(campaignKeySchema).max(40),
    notes: z
      .record(campaignKeySchema, z.string().trim().min(1).max(BOOK_NOTE_CHARS))
      .refine((notes) => Object.keys(notes).length <= MAX_BOOK_NOTES),
  })
  .strict();
export type BookPlace = z.infer<typeof bookPlaceSchema>;
export const EMPTY_BOOK_PLACE: BookPlace = { ribbon: null, played: [], notes: {} };

const worldId = z.string().min(1).max(200);
/** What the book's keys are in this world: an entity, a clue, a prepared encounter by key. */
export const bookIdsSchema = z
  .object({
    entities: z.record(campaignKeySchema, worldId),
    clues: z.record(campaignKeySchema, worldId),
    encounters: z.record(campaignKeySchema, worldId),
  })
  .strict();
export type BookIds = z.infer<typeof bookIdsSchema>;

/** The campaign's book opened for its DM. */
export const openedBookSchema = z
  .object({
    content: campaignBookSchema,
    ids: bookIdsSchema,
    place: bookPlaceSchema,
    /** The book's clues the table has found so far, by key. */
    found: z.array(campaignKeySchema).max(500),
  })
  .strict();
export type OpenedBook = z.infer<typeof openedBookSchema>;

/**
 * GET …/dm/book (the DM): the book, or null when the campaign has none — or has one that still
 * waits for the owner's reading. Anyone who is not this campaign's DM gets 404, as on every DM
 * route.
 */
export const campaignBookResponseSchema = z.object({ book: openedBookSchema.nullable() }).strict();
export type CampaignBookResponse = z.infer<typeof campaignBookResponseSchema>;

/** POST …/dm/book/place (the DM): the whole place, the last write kept; 404 without a book. */
export const saveBookPlaceSchema = bookPlaceSchema;
