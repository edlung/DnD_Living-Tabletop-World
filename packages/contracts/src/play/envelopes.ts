import { z } from 'zod';

import { sessionIdSchema } from '../memory/commands.ts';

/**
 * Sealed envelopes (docs/adr/0073-table-ideas.md §9): a handout from the DM's library, sealed for
 * the party ahead of time. The party sees the envelope from outside — the words the DM put on it
 * and what opens it — and never its inside until it opens: on the DM's word, or by itself when
 * the chapter of the evening it names is written. Opened, it is a handout like any other (ADR 0044
 * §5). Table data beside the world, never canonical.
 */
export const ENVELOPE_LABEL_MAX = 120;
/** Envelopes a campaign holds at most, sealed and opened together. */
export const MAX_ENVELOPES = 50;

export const ENVELOPE_OPENS = ['word', 'chapter'] as const;
export type EnvelopeOpens = (typeof ENVELOPE_OPENS)[number];

/**
 * `POST …/dm/envelopes/:envelopeId` (the DM): a kept handout sealed. Its inside is copied from the
 * library's entry as it stands; `chapter` names the evening whose chapter opens it — the session
 * open now, else the next one that ends with a chapter.
 */
export const sealEnvelopeSchema = z
  .object({
    /** The library's kept handout that goes inside. */
    entryId: z.uuid(),
    /** What the outside says, for the party to read. */
    label: z.string().trim().min(1).max(ENVELOPE_LABEL_MAX),
    opens: z.enum(ENVELOPE_OPENS),
  })
  .strict();
export type SealEnvelope = z.infer<typeof sealEnvelopeSchema>;

export const envelopeParamsSchema = z.object({ envelopeId: z.uuid() }).strict();

/** The answer to a sealing: 201 the first time, 200 for a retried request — the same envelope. */
export interface SealedEnvelopeResponse {
  readonly envelopeId: string;
}

/** An envelope from outside: all the party is sent while it is sealed. */
export interface SealedEnvelopeView {
  readonly envelopeId: string;
  readonly label: string;
  readonly opens: EnvelopeOpens;
  readonly sealedAt: string;
}

/** `GET /campaigns/:campaignId/envelopes?perspective=…`: the party's sealed envelopes, oldest first. */
export interface EnvelopesResponse {
  readonly perspective: string;
  readonly envelopes: readonly SealedEnvelopeView[];
}

/** An envelope as the DM keeps it: its outside, its inside, and how it stands. */
export interface DmEnvelopeView extends SealedEnvelopeView {
  /** The inside: the handout it becomes. */
  readonly title: string;
  readonly text: string | null;
  readonly picture: { readonly entityId: string; readonly name: string | null } | null;
  /** The evening whose chapter opens it, by its title; null for the DM's word, or the next evening. */
  readonly evening: string | null;
  /** When it opened; null while sealed. */
  readonly openedAt: string | null;
  /** What opened it. */
  readonly openedBy: EnvelopeOpens | null;
}

/** `GET /campaigns/:campaignId/dm/envelopes` (the DM): every envelope, the sealed first. */
export interface DmEnvelopesResponse {
  readonly envelopes: readonly DmEnvelopeView[];
  readonly limit: number;
}

/** The evening an envelope names, as its record keeps it. */
export const envelopeSessionSchema = sessionIdSchema.nullable();
