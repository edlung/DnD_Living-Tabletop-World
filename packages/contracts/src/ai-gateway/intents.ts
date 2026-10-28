import { z } from 'zod';

import { proposalCommandsSchema, proposalSummarySchema } from '../authoring/commands.ts';
import type { RankingStatus, Relevance } from '../context/views.ts';
import type { DialogueIntent, DialogueStatus } from '../npc/dialogue.ts';

/**
 * AI gateway contracts (docs/adr/0017-ai-gateway.md). The AI proposes; it
 * never commits. A proposal carries commands in the World Engine's own
 * schemas (`authoring/commands.ts`); only the DM's confirmed authoring
 * proposal commits (docs/adr/0018-ai-authoring.md).
 */

/** Capability-oriented provider interfaces (ARCHITECTURE.md, Provider Routing). */
export const AI_CAPABILITIES = [
  'reasoning',
  'fast-context',
  'continuity',
  'npc-dialogue',
  'narrative',
  'vision',
  'image-generation',
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

/** The structured output every intent provider must return. */
export const commandProposalSchema = z
  .object({
    summary: proposalSummarySchema,
    commands: proposalCommandsSchema,
  })
  .strict();
export type CommandProposal = z.infer<typeof commandProposalSchema>;

/**
 * Why an intent provider deliberately proposed nothing (docs/adr/0032-live-ai.md, B1). A decline
 * is the provider's valid answer, never a proposal: the public result stays `INVALID_OUTPUT` with
 * the fixed issue `NO_PROPOSAL`, and only the trace records the reason.
 */
export const INTENT_DECLINE_REASONS = ['not_game', 'ambiguous', 'unsupported'] as const;
export type IntentDeclineReason = (typeof INTENT_DECLINE_REASONS)[number];

/** `POST /campaigns/:campaignId/ai/intents` body. */
export const dmIntentRequestSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export type DmIntentRequest = z.infer<typeof dmIntentRequestSchema>;

export const INTENT_STATUSES = ['PROPOSED', 'INVALID_OUTPUT', 'AI_UNAVAILABLE'] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export interface DmIntentResponse {
  /**
   * The persisted trace, or null when no durable request start was confirmed (docs/adr/0032-live-ai.md,
   * B2): then nothing was proposed and nothing can be authored from this response.
   */
  readonly traceId: string | null;
  readonly status: IntentStatus;
  /** Present only when the output passed validation. */
  readonly proposal: CommandProposal | null;
  readonly issues: readonly string[];
  /**
   * Always false: an intent's proposal is never committed as is. The DM
   * commits it through an authoring proposal (docs/adr/0018-ai-authoring.md).
   */
  readonly committable: false;
}

export type AttemptKind = 'initial' | 'repair' | 'fallback';
export type AttemptOutcome = 'valid' | 'invalid' | 'error';

/**
 * What an attempt's trace records about its cost when the result froze (docs/adr/0032-live-ai.md,
 * B2). `local`: the zero-cost local provider. `not_dispatched`: refused before transport (an
 * admission denial or proven not-started transport), zero. `known`: validated usage priced at the
 * attempt's pricing version. `unknown`: possibly billed with no priced usage; the reservation stays
 * held. Amounts are integer microdollars as decimal strings. Later settlement resolves only through
 * the accounting diagnostic; a trace never changes.
 */
export interface AttemptBillingView {
  readonly status: 'local' | 'not_dispatched' | 'known' | 'unknown';
  readonly pricingVersion: string | null;
  readonly reservedMicros: string | null;
  readonly costMicros: string | null;
}

/** One provider call within a request. */
export interface AiAttemptView {
  readonly provider: string;
  readonly model: string | null;
  readonly kind: AttemptKind;
  readonly outcome: AttemptOutcome;
  /**
   * The fixed code when the attempt failed or was not dispatched: a transport code
   * (`TRANSPORT_NOT_STARTED`, `UNAVAILABLE`, `TIMEOUT`, `BAD_RESPONSE`), `PROVIDER_REFUSAL`,
   * `UNEXPECTED_MODEL`, `UNVERIFIED_BILLING`, an admission denial, `CALLER_CANCELLED`, or
   * `INTERNAL_ERROR` (the caller's own validation threw; never persisted, the request is recovered).
   */
  readonly error: string | null;
  readonly issues: readonly string[];
  /** The provider's raw structured output as JSON, cut at 8 KB; null when it failed. */
  readonly output: string | null;
  readonly latencyMs: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
  /** Additive (B2): the journal's attempt ID. Absent on earlier traces: legacy, unknown cost. */
  readonly attemptId?: string;
  /** Additive (B2): cost metadata at freeze. Absent means legacy or unknown, never zero. */
  readonly billing?: AttemptBillingView;
}

interface AiTraceBase {
  readonly traceId: string;
  readonly campaignId: string;
  readonly actorId: string;
  readonly capability: AiCapability;
  /** The knowledge perspective the context came from. */
  readonly scope: string;
  readonly sourceIds: readonly string[];
  /** The DM's text, or the player's own words to an NPC ('' when none). */
  readonly input: string;
  readonly attempts: readonly AiAttemptView[];
  readonly issues: readonly string[];
  /** Canonical events this AI request produced: always none. */
  readonly canonicalEvents: readonly string[];
  readonly createdAt: string;
}

export interface DmIntentTraceView extends AiTraceBase {
  readonly purpose: 'dm-intent';
  readonly status: IntentStatus;
  readonly proposal: CommandProposal | null;
  /** Additive (B1): the validated decline reason; absent on earlier traces and on other outcomes. */
  readonly declineReason?: IntentDeclineReason;
}

/** An NPC's reply (docs/adr/0020-npc-intelligence.md §3); its scope is `NPC:<id>`. */
export interface NpcDialogueTraceView extends AiTraceBase {
  readonly purpose: 'npc-dialogue';
  readonly status: DialogueStatus;
  readonly intent: DialogueIntent;
  /** The canonical command the World Engine decided before the reply; null for Talk. */
  readonly commandId: string | null;
  readonly reply: string | null;
  /**
   * Additive (owner decisions 11, round 2): the character it replied to; absent on earlier
   * traces. Lets the NPC know it has spoken with them (ADR 0020 amendment 2026-10-28, round 2).
   */
  readonly speakerId?: string;
}

/**
 * A relevance ranking (docs/adr/0021-ai-relevance.md); its scope is the acting
 * perspective. Maps each opaque key back to the action it stood for.
 */
export interface RelevanceTraceView extends AiTraceBase {
  readonly purpose: 'relevance';
  readonly status: Exclude<RankingStatus, 'NOT_REQUESTED' | 'NOTHING_TO_RANK'>;
  /** The selected entity. */
  readonly entityId: string;
  readonly actions: readonly {
    readonly key: string;
    readonly id: string;
    readonly topicId: string | null;
    readonly evidenceId: string | null;
  }[];
  /** The validated ranking that was applied; null when none was. */
  readonly ranking: readonly { readonly key: string; readonly relevance: Relevance }[] | null;
}

/**
 * A Chronicle rendering (docs/adr/0024-chronicle.md); its scope is the
 * chapter's perspective. Maps each opaque entry key to the entry's sources.
 */
export interface ChronicleTraceView extends AiTraceBase {
  readonly purpose: 'chronicle';
  readonly status: 'RENDERED' | 'AI_UNAVAILABLE' | 'INVALID_OUTPUT';
  readonly title: string;
  readonly entries: readonly { readonly key: string; readonly source: string }[];
  /** The validated paragraphs; null when the template was used instead. */
  readonly paragraphs:
    readonly { readonly text: string; readonly cites: readonly string[] }[] | null;
}

/** `GET /campaigns/:campaignId/ai/traces/:traceId` (DM only): why the system said, ranked, or proposed this. */
export type AiTraceView =
  DmIntentTraceView | NpcDialogueTraceView | RelevanceTraceView | ChronicleTraceView;
