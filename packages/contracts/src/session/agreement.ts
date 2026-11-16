import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';

/**
 * The table's agreement (docs/adr/0071-memory-and-ritual.md §4): how this table plays — the tone,
 * what is not in this game, the sign for a pause, a word on ages — written by the DM once a
 * campaign and read by everyone before their first evening. Table data beside the world, never
 * canonical: no World Engine decision reads it, and (in this stage) no AI prompt does.
 */
export const AGREEMENT_TONES = ['cosy', 'adventurous', 'spooky', 'grim'] as const;
export type AgreementTone = (typeof AGREEMENT_TONES)[number];
/** What a table may tick as "not in this game"; its own lines go beside them. */
export const AGREEMENT_LIMITS = [
  'gore',
  'cruelty-to-animals',
  'harm-to-children',
  'torture',
  'sudden-frights',
  'romance',
  'fights-between-players',
  'swearing',
] as const;
export type AgreementLimit = (typeof AGREEMENT_LIMITS)[number];
export const AGREEMENT_LINE_CHARS = 200;
export const AGREEMENT_OWN_CHARS = 400;

const line = z.string().trim().max(AGREEMENT_LINE_CHARS);

/** `POST /campaigns/:campaignId/agreement?perspective=DM`: the whole page, written anew. */
export const agreementRequestSchema = z
  .object({
    tone: z.enum(AGREEMENT_TONES),
    /** The DM's own line about the tone. */
    toneNote: line,
    limits: z
      .array(z.enum(AGREEMENT_LIMITS))
      .max(AGREEMENT_LIMITS.length)
      .refine((limits) => new Set(limits).size === limits.length),
    /** What else is not in this game, in the table's own words. */
    alsoNot: z.string().trim().max(AGREEMENT_OWN_CHARS),
    /** The sign the table agreed on for "stop, I need a pause". */
    pauseSign: line,
    /** A word on ages: who plays, what that asks of the story. */
    ages: line,
  })
  .strict();
export type AgreementRequest = z.infer<typeof agreementRequestSchema>;

export interface AgreementView extends AgreementRequest {
  /** Grows with each change of the words: "Understood" is said to a version. */
  readonly version: number;
  readonly updatedAt: string;
}

/** Who said "Understood" to the agreement as it stands; the DM's alone to read. */
export interface AgreementReader {
  readonly character: { readonly entityId: string; readonly name: string };
  readonly understood: boolean;
}

/** `GET /campaigns/:campaignId/agreement?perspective=…`. */
export interface AgreementResponse {
  readonly perspective: string;
  /** Null until the DM writes one. */
  readonly agreement: AgreementView | null;
  /**
   * Whether the reader's own character said "Understood" to the agreement as it stands; null for
   * a reader who is no single character (the DM, the party's view, a table display).
   */
  readonly understood: boolean | null;
  /** Each character at the table, for the DM; null for anyone else. */
  readonly readers: readonly AgreementReader[] | null;
}

/** `POST /campaigns/:campaignId/agreement/understood?perspective=…`. */
export const agreementUnderstoodRequestSchema = z
  .object({
    /** The version that was read: an older one is refused, so nobody agrees to words unseen. */
    version: z.number().int().min(1),
    /** Whose "Understood": the player's own character, or anyone at the table for the DM. */
    characterId: entityIdSchema,
  })
  .strict();
export type AgreementUnderstoodRequest = z.infer<typeof agreementUnderstoodRequestSchema>;
