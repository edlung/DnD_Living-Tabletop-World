import {
  claimTargetSchema,
  entityIdSchema,
  knowledgeClaimSchema,
  knowledgeIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Claim and contradiction event payloads and undo restores
 * (docs/adr/0014-contradictions-and-epistemic-integrity.md). Composed into
 * the campaign stream's event union in kernel/events.ts. Both events are DM
 * data: they never reach a player.
 */
export const holderScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PUBLIC') }).strict(),
  z.object({ kind: z.literal('PARTY') }).strict(),
  z.object({ kind: z.literal('CHARACTER'), characterId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('NPC'), npcId: entityIdSchema }).strict(),
]);

export const claimSetPayloadSchema = z
  .object({
    target: claimTargetSchema,
    claim: knowledgeClaimSchema,
    /** Where a copied claim came from (a shared record or a revealing clue); null if authored. */
    source: claimTargetSchema.nullable(),
  })
  .strict();

export const contradictionDetectedPayloadSchema = z
  .object({
    /** The CONTRADICTION record assigned just before this event. */
    knowledgeId: knowledgeIdSchema,
    scope: holderScopeSchema,
    subjectId: entityIdSchema,
    aspect: knowledgeClaimSchema.shape.aspect,
    /** The two conflicting records, in ID order. */
    between: z.tuple([knowledgeIdSchema, knowledgeIdSchema]),
  })
  .strict();

export const epistemicRestoreSchemas = [
  z.object({ fact: z.literal('claim'), target: claimTargetSchema, value: z.null() }).strict(),
  z
    .object({ fact: z.literal('contradiction'), key: z.string().min(1).max(400), value: z.null() })
    .strict(),
] as const;
