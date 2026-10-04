import type { AiTraceView, DmIntentResponse } from '@ltw/contracts';
import {
  campaignRole,
  holderPerspective,
  type Actor,
  type IdGenerator,
  type WallClock,
  type WorldState,
} from '@ltw/domain';

import { buildContext } from './context-builder.ts';
import { runWithFallback, type FallbackResult } from './fallback.ts';
import { intentRequest } from './prompt.ts';
import type { CapabilityRouter } from './router.ts';
import type { AiTraceStore } from './traces.ts';
import { validateProposal } from './validation.ts';

/**
 * DM natural language → a proposed structured command (Stage 100's one use
 * case, docs/adr/0017-ai-gateway.md). Only the campaign's DM may ask, and the
 * check runs before any provider is called. The context is the PUBLIC
 * directory (owner decision, §3), built once and reused by every attempt.
 * The result is traced and is never committable: this function reads a
 * snapshot and has no path to the World Engine.
 */
export interface IntentDeps {
  readonly router: CapabilityRouter;
  readonly traces: AiTraceStore;
  readonly ids: IdGenerator;
  readonly clock: WallClock & { readonly nowMs: () => number };
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

function responseOf(traceId: string, result: FallbackResult): DmIntentResponse {
  return {
    traceId,
    status: result.status,
    proposal: result.status === 'PROPOSED' ? result.proposal : null,
    issues: result.status === 'INVALID_OUTPUT' ? result.issues : [],
    committable: false,
  };
}

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
  const result = await runWithFallback({
    providers: deps.router.providersFor(CAPABILITY),
    build: (repair) => intentRequest(input.text, context, repair),
    validate: (output) => validateProposal(output, directory),
    nowMs: deps.clock.nowMs,
  });

  const response = responseOf(deps.ids.next(), result);
  const trace: AiTraceView = {
    traceId: response.traceId,
    campaignId: input.campaignId,
    actorId: input.actor.actorId,
    purpose: 'dm-intent',
    capability: CAPABILITY,
    scope: context.scope,
    sourceIds: context.items.map((item) => item.sourceId),
    input: input.text,
    attempts: result.attempts,
    status: response.status,
    proposal: response.proposal,
    issues: response.issues,
    canonicalEvents: [],
    createdAt: deps.clock.now(),
  };
  await deps.traces.append(trace);
  return { ok: true, response };
}
