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

/** An EVIDENCE record shown to an NPC; `subjects` are those newly shown to it by `scope` (ADR 0020 §1). */
export const evidenceShownPayloadSchema = z
  .object({
    characterId: entityIdSchema,
    npcId: entityIdSchema,
    scope,
    knowledgeId: knowledgeIdSchema,
    subjects: z.array(entityIdSchema).max(16),
  })
  .strict();

/** A Wisdom (Insight) check on an NPC; `inferenceId` is the record it yielded, if any (ADR 0020 §4). */
export const insightCheckedPayloadSchema = z
  .object({
    characterId: entityIdSchema,
    npcId: entityIdSchema,
    topicId: entityIdSchema,
    scope,
    roll: z
      .object({
        d20: z.number().int().min(1).max(20),
        modifier: z.number().int().min(-10).max(30),
        total: z.number().int(),
      })
      .strict(),
    inferenceId: knowledgeIdSchema.nullable(),
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
const currentPremises = [
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
   * Authorized as the player of the character commanding this creature in the fight
   * (docs/adr/0044-online-play.md §7).
   */
  z
    .object({
      kind: z.literal('commander'),
      characterId: entityIdSchema,
      playerActorId: actorIdSchema,
    })
    .strict(),
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
   * A clue the sensing did not reach: the result read the clue and relied on
   * its entity being out of reach (Gate 03 remediation, negative premises).
   */
  z
    .object({ kind: z.literal('unreached'), clueId: clueIdSchema, entityId: entityIdSchema })
    .strict(),
  /** The NPC's attitude toward the party decided whether a guarded record could be shared (ADR 0020 §2). */
  z.object({ kind: z.literal('attitude'), npcId: entityIdSchema }).strict(),
  /** A subject the scope had shown the NPC unlocked a guarded record (ADR 0020 §2). */
  z
    .object({
      kind: z.literal('shown'),
      scope,
      npcId: entityIdSchema,
      subjectId: entityIdSchema,
    })
    .strict(),
  /**
   * An NPC record about the topic was considered and not shared by this answer: the
   * result relied on its disclosure and on whether the scope had been told it
   * before (ADR 0020 §2, §4).
   */
  z.object({ kind: z.literal('considered'), scope, knowledgeId: knowledgeIdSchema }).strict(),
] as const;

/** The premises the current writer records. */
export const premiseSchema = z.discriminatedUnion('kind', currentPremises);
export type Premise = z.infer<typeof premiseSchema>;

/**
 * Every premise any writer ever recorded, read with its original meaning
 * (Gate 03 retest 2, G03-H05). Besides the current ones: `placement`, written
 * only by revision 88d8137 (Gate 03 retest 1), where Detect Magic passed over
 * an entity's magic clues because the entity was out of reach. It names the
 * entity but not its clues; `unreached` replaced it.
 */
export const recordedPremiseSchema = z.discriminatedUnion('kind', [
  ...currentPremises,
  z.object({ kind: z.literal('placement'), entityId: entityIdSchema }).strict(),
]);
export type RecordedPremise = z.infer<typeof recordedPremiseSchema>;

/**
 * `PremisesRecorded` as read, whatever its version (`kernel/event-versions.ts`):
 * version 1 holds any recorded premise; version 2, written now, only current ones.
 */
export const recordedPremisesPayloadSchema = z
  .object({ characterId: entityIdSchema, premises: z.array(recordedPremiseSchema).max(512) })
  .strict();

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
  z.object({ fact: z.literal('shown'), key: z.string().min(1).max(300), value: z.null() }).strict(),
] as const;
