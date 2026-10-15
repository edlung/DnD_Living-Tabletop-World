import {
  KNOWLEDGE_TYPES,
  actorIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
  knowledgeRelationSchema,
  knowledgeScopeSchema,
  worldTimeSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Knowledge event payloads and undo restores. Composed into the campaign
 * stream's event union in kernel/events.ts.
 */
export const knowledgeAssignedPayloadSchema = z
  .object({
    knowledgeId: knowledgeIdSchema,
    scope: knowledgeScopeSchema,
    knowledgeType: z.enum(KNOWLEDGE_TYPES),
    statement: z.string().min(1).max(2000),
    subjects: z.array(entityIdSchema).max(16),
    attributedTo: entityIdSchema.nullable(),
    relations: z.array(knowledgeRelationSchema).max(16),
    knownSince: worldTimeSchema.nullable(),
  })
  .strict();

export const characterAssignedPayloadSchema = z
  .object({ characterId: entityIdSchema, playerActorId: actorIdSchema })
  .strict();

/** The character's player from before the release (docs/adr/0036-production-sign-in.md §4). */
export const characterReleasedPayloadSchema = z
  .object({ characterId: entityIdSchema, playerActorId: actorIdSchema })
  .strict();

export const knowledgeRestoreSchemas = [
  z
    .object({ fact: z.literal('knowledge'), knowledgeId: knowledgeIdSchema, value: z.null() })
    .strict(),
  z
    .object({
      fact: z.literal('roster'),
      characterId: entityIdSchema,
      playerActorId: actorIdSchema,
      value: z.null(),
    })
    .strict(),
  // Undoing a release: the release goes back to nothing, so the player controls the character
  // again, in its place in assignment order (the sequence of the assignment it had).
  z
    .object({
      fact: z.literal('release'),
      characterId: entityIdSchema,
      playerActorId: actorIdSchema,
      assignedAt: z.number().int().min(1),
      value: z.null(),
    })
    .strict(),
] as const;
