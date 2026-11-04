import { z } from 'zod';

import { dieSidesSchema, type DieSides } from '../dice/rolls.ts';
import { entityIdSchema } from '../kernel/identifiers.ts';
import { HANDOUT_TEXT_MAX, HANDOUT_TITLE_MAX } from './handouts.ts';

/**
 * The DM's library (docs/adr/0058-campaign-content.md §3–4): handouts written ahead and random
 * tables, kept beside the world as the DM's notes are and never a player's to read. A kept handout
 * is given as any handout (ADR 0044 §5) and stays in the library; a roll on a table is a table
 * roll the server makes, for the DM alone or for the table, its result named beside it.
 */
export const MAX_KEPT_HANDOUTS = 100;
export const MAX_RANDOM_TABLES = 50;
export const RANDOM_TABLE_NAME_MAX = 80;
export const TABLE_RESULT_MAX = 300;

/** `POST …/dm/library/handouts/:entryId` (the DM): a handout kept for later, new or changed. */
export const keptHandoutSchema = z
  .object({
    title: z.string().trim().min(1).max(HANDOUT_TITLE_MAX),
    text: z.string().trim().min(1).max(HANDOUT_TEXT_MAX).optional(),
    /** The entity whose approved picture it shows; given only to someone who knows it. */
    entityId: entityIdSchema.optional(),
  })
  .strict()
  .refine((body) => body.text !== undefined || body.entityId !== undefined, {
    message: 'A handout holds a text, a picture, or both',
  });
export type KeptHandout = z.infer<typeof keptHandoutSchema>;

export interface KeptHandoutView {
  readonly entryId: string;
  readonly title: string;
  readonly text: string | null;
  /** The pictured entity by the DM's name for it; null when none. */
  readonly picture: { readonly entityId: string; readonly name: string | null } | null;
  readonly updatedAt: string;
  /** When it was last given; null while it never was. */
  readonly givenAt: string | null;
}

/** `POST …/dm/library/handouts/:entryId/give`: to one character's player, or the party. */
export const giveKeptHandoutSchema = z.object({ recipientId: entityIdSchema.optional() }).strict();

const tableResult = z
  .object({
    from: z.number().int().min(1).max(100),
    to: z.number().int().min(1).max(100),
    text: z.string().trim().min(1).max(TABLE_RESULT_MAX),
  })
  .strict();
export type TableResult = z.infer<typeof tableResult>;

/**
 * Where a table's ranges fail to cover its die once, in order from 1: the first face no result
 * holds or two hold, or null when every face has exactly one result.
 */
export function rangeGap(die: DieSides, results: readonly TableResult[]): number | null {
  let next = 1;
  for (const result of results) {
    if (result.from !== next || result.to < result.from) return next;
    next = result.to + 1;
  }
  return next === die + 1 ? null : next;
}

/** `POST …/dm/library/tables/:entryId` (the DM): a random table, new or changed. */
export const randomTableSchema = z
  .object({
    name: z.string().trim().min(1).max(RANDOM_TABLE_NAME_MAX),
    die: dieSidesSchema,
    /** In order, each face of the die in exactly one range. */
    results: z.array(tableResult).min(1).max(100),
  })
  .strict()
  .refine((table) => rangeGap(table.die, table.results) === null, {
    message: 'The results cover each face of the die once, in order',
  });
export type RandomTable = z.infer<typeof randomTableSchema>;

/** The result a face of the die brings. */
export const resultOn = (table: RandomTable, face: number): TableResult | undefined =>
  table.results.find((result) => face >= result.from && face <= result.to);

export interface RandomTableView extends RandomTable {
  readonly entryId: string;
  readonly updatedAt: string;
}

/** `POST …/dm/library/tables/:entryId/roll`: for the DM alone, or for the table to see. */
export const rollOnTableSchema = z.object({ hidden: z.boolean() }).strict();

/** `GET …/dm/library` (the DM): the kept handouts and the tables, newest change first. */
export interface DmLibraryResponse {
  readonly handouts: readonly KeptHandoutView[];
  readonly tables: readonly RandomTableView[];
}
