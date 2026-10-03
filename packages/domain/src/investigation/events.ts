import {
  DISCLOSURES,
  EXAMINE_METHODS,
  clueIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Investigation event payloads and undo restores (docs/adr/0013-investigation.md).
 * Composed into the campaign stream's event union in kernel/events.ts.
 * `scope` is a holder scope key (`PARTY` or `CHARACTER:<id>`).
 */
const scope = z.string().regex(/^(PARTY|CHARACTER:[a-z0-9][a-z0-9_-]{0,63})$/);
const method = z.enum(EXAMINE_METHODS);

export const clueAddedPayloadSchema = z
  .object({
    clueId: clueIdSchema,
    entityId: entityIdSchema,
    method,
    dc: z.number().int().min(5).max(30).nullable(),
    statement: z.string().min(1).max(2000),
    subjects: z.array(entityIdSchema).max(16),
  })
  .strict();

export const disclosureSetPayloadSchema = z
  .object({ knowledgeId: knowledgeIdSchema, disclosure: z.enum(DISCLOSURES) })
  .strict();

export const evidenceExaminedPayloadSchema = z
  .object({
    characterId: entityIdSchema,
    entityId: entityIdSchema,
    method,
    scope,
    /** Null for `inspect`; a check records its d20, modifier and total. */
    roll: z
      .object({
        d20: z.number().int().min(1).max(20),
        modifier: z.number().int().min(-10).max(30),
        total: z.number().int(),
      })
      .strict()
      .nullable(),
    /** Revealed clues and the records that carry them to `scope`. */
    revealed: z
      .array(z.object({ clueId: clueIdSchema, knowledgeId: knowledgeIdSchema }).strict())
      .max(16),
  })
  .strict();

export const informationSharedPayloadSchema = z
  .object({
    npcId: entityIdSchema,
    characterId: entityIdSchema,
    scope,
    sourceKnowledgeId: knowledgeIdSchema,
    knowledgeId: knowledgeIdSchema,
  })
  .strict();

export const investigationRestoreSchemas = [
  z.object({ fact: z.literal('clue'), clueId: clueIdSchema, value: z.null() }).strict(),
  z
    .object({
      fact: z.literal('disclosure'),
      knowledgeId: knowledgeIdSchema,
      value: z.enum(DISCLOSURES).nullable(),
    })
    .strict(),
  z
    .object({ fact: z.literal('attempt'), key: z.string().min(1).max(200), value: z.null() })
    .strict(),
  z
    .object({ fact: z.literal('revealed'), key: z.string().min(1).max(200), value: z.null() })
    .strict(),
  z
    .object({ fact: z.literal('shared'), key: z.string().min(1).max(200), value: z.null() })
    .strict(),
] as const;
