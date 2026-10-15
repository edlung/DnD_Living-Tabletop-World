import { z } from 'zod';

import { actorIdSchema, entityIdSchema, knowledgeIdSchema } from '../kernel/identifiers.ts';
import { worldTimeSchema } from '../kernel/world-time.ts';

/**
 * Knowledge vocabulary and authoring commands (docs/adr/0008-knowledge-boundary.md).
 * Schemas validate shape only; the World Engine decides legality.
 */
export const KNOWLEDGE_TYPES = [
  'FACT',
  'EVIDENCE',
  'TESTIMONY',
  'RUMOR',
  'INFERENCE',
  'HYPOTHESIS',
  'CONTRADICTION',
  'UNKNOWN',
  'SECRET',
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const KNOWLEDGE_RELATION_TYPES = [
  'SUPPORTS',
  'CONTRADICTS',
  'DERIVED_FROM',
  'REFERS_TO',
] as const;
export type KnowledgeRelationType = (typeof KNOWLEDGE_RELATION_TYPES)[number];

/** The single holder of a knowledge record. */
export const knowledgeScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('WORLD_TRUTH') }).strict(),
  z.object({ kind: z.literal('DM') }).strict(),
  z.object({ kind: z.literal('PUBLIC') }).strict(),
  z.object({ kind: z.literal('PARTY') }).strict(),
  z.object({ kind: z.literal('CHARACTER'), characterId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('NPC'), npcId: entityIdSchema }).strict(),
]);
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;

export const knowledgeRelationSchema = z
  .object({ type: z.enum(KNOWLEDGE_RELATION_TYPES), knowledgeId: knowledgeIdSchema })
  .strict();
export type KnowledgeRelation = z.infer<typeof knowledgeRelationSchema>;

export const addKnowledgeCommandSchema = z
  .object({
    type: z.literal('AddKnowledge'),
    knowledgeId: knowledgeIdSchema.optional(),
    scope: knowledgeScopeSchema,
    knowledgeType: z.enum(KNOWLEDGE_TYPES),
    statement: z.string().trim().min(1).max(2000),
    /** World entities the record is about. */
    subjects: z.array(entityIdSchema).max(16).optional(),
    /** Who asserted it: required for TESTIMONY, allowed for RUMOR. */
    attributedTo: entityIdSchema.optional(),
    relations: z.array(knowledgeRelationSchema).max(16).optional(),
    /** World time the holder learned it; `null` = before recorded history. */
    knownSince: worldTimeSchema.nullable(),
  })
  .strict();

/** A player user controls a character; assigned characters form the party. */
export const assignCharacterCommandSchema = z
  .object({
    type: z.literal('AssignCharacter'),
    characterId: entityIdSchema,
    playerActorId: actorIdSchema,
  })
  .strict();

/**
 * The DM frees an assigned character from its player from now on (docs/adr/0036-production-sign-in.md
 * §4): the character leaves the party and can be invited again; earlier commands stay history.
 */
export const releaseCharacterCommandSchema = z
  .object({ type: z.literal('ReleaseCharacter'), characterId: entityIdSchema })
  .strict();
