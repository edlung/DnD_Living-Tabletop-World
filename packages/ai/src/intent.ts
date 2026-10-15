import {
  INTENT_DECLINE_REASONS,
  type AiTraceView,
  type CommandProposal,
  type DmIntentResponse,
  type IntentDeclineReason,
} from '@ltw/contracts';
import {
  campaignRole,
  holderPerspective,
  type Actor,
  type IdGenerator,
  type WallClock,
  type WorldState,
} from '@ltw/domain';

import { buildContext } from './context-builder.ts';
import type { FallbackResult } from './fallback.ts';
import { intentRequest } from './prompt.ts';
import { runAiRequest } from './request.ts';
import type { CapabilityRouter } from './router.ts';
import type { AiTraceStore } from './traces.ts';
import { validateIntent } from './validation.ts';

/**
 * DM natural language → a proposed structured command (Stage 100's one use
 * case, docs/adr/0017-ai-gateway.md). Only the campaign's DM may ask, and the
 * check runs before any provider is called. The context is the PUBLIC
 * directory (owner decision, §3), built once and reused by every attempt.
 * The result is traced and is never committable: this function reads a
 * snapshot and has no path to the World Engine. A provider's deliberate
 * decline is a terminal INVALID_OUTPUT with the issue NO_PROPOSAL and no
 * repair (docs/adr/0032-live-ai.md, B1); its reason is traced.
 *
 * Every request runs one lifecycle (`runAiRequest`, ADR 0032 B2): a whole-request deadline of
 * `requestTimeoutMs`, a durable start, the outcome freeze and the stored trace. Without a confirmed
 * start the answer is AI_UNAVAILABLE with no trace ID and no proposal, and no provider runs, not
 * even locally: a proposal without a trace could never become an authoring source. The campaign's
 * active play session, read from this snapshot, is the only one the request may be charged to.
 */
export interface IntentDeps {
  readonly router: CapabilityRouter;
  readonly traces: AiTraceStore;
  readonly ids: IdGenerator;
  readonly clock: WallClock & { readonly nowMs: () => number };
  /** The whole-request deadline of intents, NPC replies and Chronicle (`LTW_AI_REQUEST_TIMEOUT_MS`). */
  readonly requestTimeoutMs: number;
}

export interface IntentInput {
  readonly campaignId: string;
  /** The campaign's current state; null when the campaign does not exist. */
  readonly state: WorldState | null;
  readonly actor: Actor;
  readonly text: string;
}

export type IntentOutcome =
  | { readonly ok: true; readonly response: DmIntentResponse }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'FORBIDDEN' };

const CAPABILITY = 'reasoning';

function responseOf(traceId: string, result: FallbackResult<CommandProposal>): DmIntentResponse {
  return {
    traceId,
    status: result.status === 'VALID' ? 'PROPOSED' : result.status,
    proposal: result.status === 'VALID' ? result.value : null,
    issues: result.status === 'INVALID_OUTPUT' ? result.issues : [],
    committable: false,
  };
}

/** No durable start: nothing proposed, nothing to author from. */
const NO_START: DmIntentResponse = {
  traceId: null,
  status: 'AI_UNAVAILABLE',
  proposal: null,
  issues: [],
  committable: false,
};

export async function interpretDmIntent(
  deps: IntentDeps,
  input: IntentInput,
): Promise<IntentOutcome> {
  const role = campaignRole(input.state, input.actor);
  if (role === null || !input.state) return { ok: false, reason: 'NOT_FOUND' };
  if (role !== 'DM') return { ok: false, reason: 'FORBIDDEN' };

  const context = buildContext(input.state, holderPerspective(input.state, { kind: 'PUBLIC' }), [
    'world-time',
    'entities',
  ]);
  const directory = new Set(context.entities.map((entity) => entity.entityId));
  const sourceIds = context.items.map((item) => item.sourceId);
  const response = await runAiRequest(
    { traces: deps.traces, ids: deps.ids, nowMs: deps.clock.nowMs },
    {
      timeoutMs: deps.requestTimeoutMs,
      start: {
        campaignId: input.campaignId,
        actorId: input.actor.actorId,
        purpose: 'dm-intent',
        capability: CAPABILITY,
        scope: context.scope,
        sourceIds,
        sessionId: input.state.activeSessionId,
      },
      providers: deps.router.providersFor(CAPABILITY),
      fallback: {
        build: (repair) => intentRequest(input.text, context, repair),
        validate: (output) => validateIntent(output, directory),
        declines: true,
      },
      noStart: () => NO_START,
      freeze: (result, traceId) => {
        const frozen = responseOf(traceId, result);
        const declineReason: IntentDeclineReason | undefined =
          result.status === 'INVALID_OUTPUT'
            ? INTENT_DECLINE_REASONS.find((reason) => reason === result.decline)
            : undefined;
        const trace: AiTraceView = {
          traceId,
          campaignId: input.campaignId,
          actorId: input.actor.actorId,
          purpose: 'dm-intent',
          capability: CAPABILITY,
          scope: context.scope,
          sourceIds,
          input: input.text,
          attempts: result.attempts,
          status: frozen.status,
          proposal: frozen.proposal,
          ...(declineReason ? { declineReason } : {}),
          issues: frozen.issues,
          canonicalEvents: [],
          createdAt: deps.clock.now(),
        };
        return { response: frozen, trace };
      },
    },
  );
  return { ok: true, response };
}
