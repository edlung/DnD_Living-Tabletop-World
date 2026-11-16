import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * A campaign's end and what its heroes keep (docs/adr/0072-keepsakes.md §2): the DM marks an
 * adventure finished — and may reopen it — and each hero keeps one thing they carry or one
 * chapter of the party's story, with a line. Table data beside the world, never canonical: a
 * finished campaign is read, not played, and nothing of the world says so.
 */
export const ENDING_LINE_CHARS = 280;
export const KEEPSAKE_LINE_CHARS = 200;
export const KEEPSAKE_KINDS = ['item', 'chapter'] as const;
export type KeepsakeKind = (typeof KEEPSAKE_KINDS)[number];

/** `POST /campaigns/:campaignId/ending?perspective=DM`: finish the campaign, or reopen it. */
export const endingRequestSchema = z
  .object({
    finished: z.boolean(),
    /** The DM's last words to the table; kept with the end, gone with a reopening. */
    line: z.string().trim().max(ENDING_LINE_CHARS).optional(),
  })
  .strict();
export type EndingRequest = z.infer<typeof endingRequestSchema>;

/** `POST /campaigns/:campaignId/keepsakes?perspective=…`: what a hero keeps; `keep` null takes it away. */
export const keepsakeRequestSchema = z
  .object({
    characterId: entityIdSchema,
    keep: z
      .object({
        kind: z.enum(KEEPSAKE_KINDS),
        /** The item the hero carries, or the party's chapter. */
        refId: z.string().min(1).max(128),
        line: z.string().trim().max(KEEPSAKE_LINE_CHARS),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type KeepsakeRequest = z.infer<typeof keepsakeRequestSchema>;

export interface CampaignEnding {
  readonly finishedAt: string;
  readonly line: string;
}

export interface KeepsakeView {
  /** Whose keepsake, named as the reader knows them. */
  readonly hero: { readonly entityId: string; readonly name: string | null };
  readonly kind: KeepsakeKind;
  readonly refId: string;
  /** The thing's or the chapter's name, as it was when it was chosen. */
  readonly label: string;
  readonly line: string;
  /** The reader may change it: their own character's, or anyone's for the DM. */
  readonly own: boolean;
}

/** `GET /campaigns/:campaignId/ending?perspective=…`: every member and a table display read it. */
export interface EndingResponse {
  readonly perspective: string;
  /** Null while the campaign is played. */
  readonly ending: CampaignEnding | null;
  readonly keepsakes: readonly KeepsakeView[];
  /** The heroes this reader may choose for: their own, or everyone's for the DM. */
  readonly heroes: readonly { readonly entityId: string; readonly name: string }[];
}
