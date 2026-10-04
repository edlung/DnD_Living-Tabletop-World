import { z } from 'zod';

import { proposalCommandsSchema, proposalSummarySchema } from '../authoring/commands.ts';

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

/** `POST /campaigns/:campaignId/ai/intents` body. */
export const dmIntentRequestSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export type DmIntentRequest = z.infer<typeof dmIntentRequestSchema>;

export const INTENT_STATUSES = ['PROPOSED', 'INVALID_OUTPUT', 'AI_UNAVAILABLE'] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export interface DmIntentResponse {
  readonly traceId: string;
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

/** One provider call within a request. */
export interface AiAttemptView {
  readonly provider: string;
  readonly model: string | null;
  readonly kind: AttemptKind;
  readonly outcome: AttemptOutcome;
  /** `ProviderError` code when the call failed. */
  readonly error: string | null;
  readonly issues: readonly string[];
  /** The provider's raw structured output as JSON, cut at 8 KB; null when it failed. */
  readonly output: string | null;
  readonly latencyMs: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

/** `GET /campaigns/:campaignId/ai/traces/:traceId` (DM only): why the system proposed this. */
export interface AiTraceView {
  readonly traceId: string;
  readonly campaignId: string;
  readonly actorId: string;
  readonly purpose: 'dm-intent';
  readonly capability: AiCapability;
  /** The knowledge perspective the context came from. */
  readonly scope: string;
  readonly sourceIds: readonly string[];
  readonly input: string;
  readonly attempts: readonly AiAttemptView[];
  readonly status: IntentStatus;
  readonly proposal: CommandProposal | null;
  readonly issues: readonly string[];
  /** Canonical events this request produced: always none in Stage 100. */
  readonly canonicalEvents: readonly string[];
  readonly createdAt: string;
}
