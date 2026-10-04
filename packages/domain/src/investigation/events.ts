import {
  CLUE_METHODS,
  DISCLOSURES,
  actorIdSchema,
  clueIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
  memoryIdSchema,
} from '@ltw/contracts';
import { z } from 'zod';

/**
 * Investigation event payloads and undo restores (docs/adr/0013-investigation.md).
 * Composed into the campaign stream's event union in kernel/events.ts.
 * `scope` is a holder scope key (`PARTY` or `CHARACTER:<id>`).
 */
const scope = z.string().regex(/^(PARTY|CHARACTER:[a-z0-9][a-z0-9_-]{0,63})$/);
/** Detect Magic reveals `magic` clues through the same record (ADR 0015 §3). */
const examination = z.enum(CLUE_METHODS);

export const clueAddedPayloadSchema = z
  .object({
    clueId: clueIdSchema,
    entityId: entityIdSchema,
    method: z.enum(CLUE_METHODS),
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
    method: examination,
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

/**
 * What a player command relied on to be legal (Gate 02 remediation, G02-H02):
 * the target being perceived, or the earliest premise that made it known, the
 * sheet that let the character speak or roll, and party membership. Read by
 * the command's footprint so that undoing a premise is UNDO_UNSAFE while the
 * action stands (ADR 0006 §8). DM-only.
 */
export const premiseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('perceived'), entityId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('self') }).strict(),
  z.object({ kind: z.literal('party-member'), characterId: entityIdSchema }).strict(),
  z
    .object({ kind: z.literal('knowledge'), knowledgeId: knowledgeIdSchema, viaParty: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('memory'), memoryId: memoryIdSchema, viaParty: z.boolean() }).strict(),
  z.object({ kind: z.literal('sheet') }).strict(),
  z.object({ kind: z.literal('party') }).strict(),
  /** Authorized as the character's controlling player (Gate 02, G02-H03). */
  z.object({ kind: z.literal('controller'), playerActorId: actorIdSchema }).strict(),
  /**
   * A creature's status, sheet, and stat block were read: every combatant for a
   * combat decision, or the target of a spell outside combat (Gate 03, G03-H02).
   */
  z.object({ kind: z.literal('vitals'), entityId: entityIdSchema }).strict(),
  /**
   * A clue was passed over because the scope had already found it: the result
   * relied on that discovery (Gate 03 remediation, negative premises).
   */
  z.object({ kind: z.literal('revealed'), scope, clueId: clueIdSchema }).strict(),
  /**
   * Where an entity was: a sensing result that did not reach it relied on it
   * being elsewhere (Gate 03 remediation, negative premises).
   */
  z.object({ kind: z.literal('placement'), entityId: entityIdSchema }).strict(),
]);
export type Premise = z.infer<typeof premiseSchema>;

export const premisesRecordedPayloadSchema = z
  .object({ characterId: entityIdSchema, premises: z.array(premiseSchema).max(512) })
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
