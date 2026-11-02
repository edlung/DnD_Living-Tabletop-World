import { z } from 'zod';

import { entityIdSchema, knowledgeIdSchema, sceneIdSchema } from '../kernel/identifiers.ts';
import { worldTimeSchema } from '../kernel/world-time.ts';

/**
 * Memory and session commands (docs/adr/0010-memory-and-temporal-retrieval.md).
 * Schemas validate shape only; the World Engine rejects impossible memories.
 */
export const MEMORY_KINDS = [
  'OBSERVATION',
  'CONVERSATION',
  'DISCOVERY',
  'DECISION',
  'CONSEQUENCE',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Memory and session IDs share the world-object format and namespace. */
export const memoryIdSchema = sceneIdSchema;
export const sessionIdSchema = sceneIdSchema;

/** The single holder of a memory. DM and WORLD_TRUTH are not memory scopes. */
export const memoryScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PUBLIC') }).strict(),
  z.object({ kind: z.literal('PARTY') }).strict(),
  z.object({ kind: z.literal('CHARACTER'), characterId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('NPC'), npcId: entityIdSchema }).strict(),
]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const recordMemoryCommandSchema = z
  .object({
    type: z.literal('RecordMemory'),
    memoryId: memoryIdSchema.optional(),
    scope: memoryScopeSchema,
    memoryKind: z.enum(MEMORY_KINDS),
    summary: z.string().trim().min(1).max(2000),
    /** World time the remembered event happened. */
    occurredAt: worldTimeSchema,
    locationId: entityIdSchema.optional(),
    participants: z.array(entityIdSchema).max(16).optional(),
    sessionId: sessionIdSchema.optional(),
    relatedKnowledge: z.array(knowledgeIdSchema).max(16).optional(),
    /** Memories that caused this one (CONSEQUENCE only). */
    causedBy: z.array(memoryIdSchema).max(16).optional(),
    salience: z.number().int().min(1).max(5).optional(),
    /**
     * A ruling's reason (docs/adr/0043-dm-screen.md §1): the DM's own, kept with the stored command
     * for the DM's history; never part of the memory.
     */
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const startSessionCommandSchema = z
  .object({
    type: z.literal('StartSession'),
    sessionId: sessionIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const endSessionCommandSchema = z
  .object({ type: z.literal('EndSession'), sessionId: sessionIdSchema })
  .strict();
