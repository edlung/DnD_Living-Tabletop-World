import {
  MEMORY_KINDS,
  entityIdSchema,
  knowledgeIdSchema,
  memoryIdSchema,
  memoryScopeSchema,
  sessionIdSchema,
  worldTimeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Memory and session event payloads and undo restores. Composed into the
 * campaign stream's event union in kernel/events.ts.
 */
export const memoryRecordedPayloadSchema = z
  .object({
    memoryId: memoryIdSchema,
    scope: memoryScopeSchema,
    memoryKind: z.enum(MEMORY_KINDS),
    summary: z.string().min(1).max(2000),
    occurredAt: worldTimeSchema,
    locationId: entityIdSchema.nullable(),
    participants: z.array(entityIdSchema).max(16),
    sessionId: sessionIdSchema.nullable(),
    relatedKnowledge: z.array(knowledgeIdSchema).max(16),
    causedBy: z.array(memoryIdSchema).max(16),
    salience: z.number().int().min(1).max(5),
    witnesses: z.array(entityIdSchema).max(16),
  })
  .strict();

export const sessionStartedPayloadSchema = z
  .object({ sessionId: sessionIdSchema, title: z.string().min(1).max(200) })
  .strict();

export const sessionEndedPayloadSchema = z.object({ sessionId: sessionIdSchema }).strict();

export const memoryRestoreSchemas = [
  z.object({ fact: z.literal('memory'), memoryId: memoryIdSchema, value: z.null() }).strict(),
  z.object({ fact: z.literal('session'), sessionId: sessionIdSchema, value: z.null() }).strict(),
  z
    .object({
      fact: z.literal('session.ended'),
      sessionId: sessionIdSchema,
      value: worldTimeSchema.nullable(),
    })
    .strict(),
  z.object({ fact: z.literal('world.activeSession'), value: sessionIdSchema.nullable() }).strict(),
] as const;
