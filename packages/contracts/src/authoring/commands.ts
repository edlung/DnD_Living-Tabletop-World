import { z } from 'zod';

import { setDisclosureCommandSchema } from '../investigation/commands.ts';
import {
  advanceWorldTimeCommandSchema,
  changeEntityStatusCommandSchema,
  createEntityCommandSchema,
  placeEntityCommandSchema,
  updateEntityProfileCommandSchema,
  worldCommandIssue,
} from '../kernel/world-commands.ts';
import { setClaimCommandSchema } from '../knowledge/claims.ts';
import { addKnowledgeCommandSchema } from '../knowledge/commands.ts';
import { setRelationshipCommandSchema } from '../relationships/commands.ts';

/**
 * AI-assisted authoring (docs/adr/0018-ai-authoring.md). A proposal is a list
 * of World Engine commands. Once the DM confirms a revision, the World Engine
 * applies it as one command, `ApplyAuthoring`, or not at all. Which commands
 * may commit is decided by the World Engine, not by this schema.
 */

/**
 * Commands a proposal may contain (ADR 0017 §4; `SetDisclosure` since ADR 0018 §2;
 * `SetClaim` and `SetRelationship` since ADR 0019).
 */
export const proposableCommandSchema = z
  .discriminatedUnion('type', [
    createEntityCommandSchema,
    placeEntityCommandSchema,
    updateEntityProfileCommandSchema,
    changeEntityStatusCommandSchema,
    advanceWorldTimeCommandSchema,
    addKnowledgeCommandSchema,
    setDisclosureCommandSchema,
    setClaimCommandSchema,
    setRelationshipCommandSchema,
  ])
  .superRefine((command, context) => {
    const issue = worldCommandIssue(command);
    if (issue !== null) context.addIssue({ code: 'custom', message: issue });
  });
export type ProposableCommand = z.infer<typeof proposableCommandSchema>;

export const MAX_PROPOSAL_COMMANDS = 12;
/** One sentence for the DM: what the commands would do. */
export const proposalSummarySchema = z.string().trim().min(1).max(500);
export const proposalCommandsSchema = z
  .array(proposableCommandSchema)
  .min(1)
  .max(MAX_PROPOSAL_COMMANDS);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Proposal and AI trace IDs are server-generated UUIDs. */
export const proposalIdSchema = z.string().regex(UUID, 'must be a lowercase UUID');
export const traceIdSchema = z.string().regex(UUID, 'must be a lowercase UUID');
export const proposalRevisionSchema = z.number().int().min(1).max(10_000);

/** Risk levels (ARCHITECTURE.md, DM Authoring Pipeline; ADR 0018 §4). */
export const RISK_LEVELS = ['L1', 'L2', 'L3', 'L4'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
/** Levels a DM can confirm. L4 (destructive or global) never commits in Stage 110. */
export const CONFIRMABLE_RISK_LEVELS = ['L1', 'L2', 'L3'] as const;
export type ConfirmableRiskLevel = (typeof CONFIRMABLE_RISK_LEVELS)[number];

/**
 * Continuity conflicts the DM may accept after acknowledging them (owner
 * decisions, ADR 0018 §3 and ADR 0019 §2).
 */
export const AUTHORING_WARNING_CODES = [
  'NAME_IN_USE',
  'WITNESS_ELSEWHERE',
  'SECRET_SUBJECT',
  'SPEAKER_NOT_ALIVE',
  'MOVES_THE_DEAD',
  'ENCOUNTER_HERE',
  'RENAME_KNOWN',
  'DUPLICATE_ACCOUNT',
  'CLAIM_CONFLICT',
  'DISCLOSURE_AGAINST_ATTITUDE',
] as const;
export type AuthoringWarningCode = (typeof AUTHORING_WARNING_CODES)[number];
/** Findings for information only; nothing to acknowledge (ADR 0019 §2). */
export const AUTHORING_NOTE_CODES = ['CLAIM_AGREES'] as const;
export type AuthoringNoteCode = (typeof AUTHORING_NOTE_CODES)[number];
/** Blocking issues of authoring itself; operations also report their own World Engine rejection codes. */
export const AUTHORING_ISSUE_CODES = [
  'UNSUPPORTED_OPERATION',
  'KNOWLEDGE_BEFORE_SUBJECT',
  'KNOWN_AFTER_DEATH',
] as const;
export type AuthoringIssueCode = (typeof AUTHORING_ISSUE_CODES)[number];

/** `CODE@commandIndex` or `CODE@commandIndex:entityId`, stable for a given revision and state. */
export const authoringWarningKeySchema = z
  .string()
  .regex(/^[A-Z_]{1,40}@\d{1,2}(?::[a-z0-9][a-z0-9_-]{0,63})?$/);

/** What the DM confirmed: a risk level and every warning they accepted. */
export const authoringConfirmationSchema = z
  .object({
    riskLevel: z.enum(CONFIRMABLE_RISK_LEVELS),
    acknowledgedWarnings: z.array(authoringWarningKeySchema).max(64),
  })
  .strict();
export type AuthoringConfirmation = z.infer<typeof authoringConfirmationSchema>;

/** Where the proposal came from: an AI trace (ADR 0017 §7) or the DM. */
export const authoringSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ai'), traceId: traceIdSchema }).strict(),
  z.object({ kind: z.literal('dm') }).strict(),
]);
export type AuthoringSource = z.infer<typeof authoringSourceSchema>;

/**
 * Applies one confirmed proposal revision atomically. DM only; issued by the
 * server's authoring service, never through the generic command route.
 */
export const applyAuthoringCommandSchema = z
  .object({
    type: z.literal('ApplyAuthoring'),
    proposalId: proposalIdSchema,
    revision: proposalRevisionSchema,
    summary: proposalSummarySchema,
    source: authoringSourceSchema,
    commands: proposalCommandsSchema,
    confirmation: authoringConfirmationSchema,
  })
  .strict();
