import { z } from 'zod';

import { entityIdSchema, knowledgeIdSchema } from '../kernel/identifiers.ts';

/**
 * Structured claims and contradiction authoring
 * (docs/adr/0014-contradictions-and-epistemic-integrity.md). A claim is DM
 * data: it never appears in non-DM views. Two records conflict when their
 * claims share subject and aspect but differ in value.
 */
export const CLAIM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().max(48).regex(CLAIM_SLUG_PATTERN, 'must be a lowercase slug');

export const knowledgeClaimSchema = z
  .object({ subjectId: entityIdSchema, aspect: slug, value: slug })
  .strict();
export type KnowledgeClaim = z.infer<typeof knowledgeClaimSchema>;

/** What a claim is attached to: a knowledge record, or a clue (copied to what it reveals). */
export const claimTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('knowledge'), knowledgeId: knowledgeIdSchema }).strict(),
  z.object({ kind: z.literal('clue'), clueId: entityIdSchema }).strict(),
]);
export type ClaimTarget = z.infer<typeof claimTargetSchema>;

export const setClaimCommandSchema = z
  .object({ type: z.literal('SetClaim'), target: claimTargetSchema, claim: knowledgeClaimSchema })
  .strict();
