import type { AiAttemptView, CampaignPreparationTraceView } from '@ltw/contracts';

import type { IntentDeps } from './intent.ts';
import type { OutputCheck, FallbackResult } from './fallback.ts';
import type { StructuredOutputSpec } from './providers.ts';
import { runAiRequest } from './request.ts';

export interface CampaignPreparationInput<T> {
  readonly traceId: string;
  readonly ownerId: string;
  readonly draftId: string;
  readonly jobId: string;
  readonly stage: string;
  readonly sessionId: string;
  readonly system: string;
  readonly prompt: string;
  readonly output: StructuredOutputSpec;
  readonly validate: (output: unknown) => OutputCheck<T>;
  readonly signal?: AbortSignal;
}

export interface CampaignPreparationResult<T> {
  readonly status: CampaignPreparationTraceView['status'];
  readonly value: T | null;
  readonly traceId: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly issues: readonly string[];
  readonly attempts: readonly AiAttemptView[];
}

function resultOf<T>(traceId: string, result: FallbackResult<T>): CampaignPreparationResult<T> {
  const chosen = result.status === 'VALID' ? result.attempts.at(-1) : undefined;
  const uncertain =
    result.status === 'AI_UNAVAILABLE' &&
    result.attempts.some(
      (attempt) =>
        attempt.billing?.status === 'unknown' &&
        ['TIMEOUT', 'UNAVAILABLE', 'BAD_RESPONSE', 'CALLER_CANCELLED'].includes(
          attempt.error ?? '',
        ),
    );
  return {
    status:
      result.status === 'VALID' ? 'GENERATED' : uncertain ? 'DISPATCH_UNKNOWN' : result.status,
    value: result.status === 'VALID' ? result.value : null,
    traceId,
    provider: chosen?.provider ?? null,
    model: chosen?.model ?? null,
    issues: result.status === 'INVALID_OUTPUT' ? result.issues : [],
    attempts: result.attempts,
  };
}

/** Only validated remote content is returned; persistence and revision attachment belong to the worker. */
export function runCampaignPreparation<T>(
  deps: IntentDeps,
  input: CampaignPreparationInput<T>,
): Promise<CampaignPreparationResult<T>> {
  const subject = { kind: 'workshop' as const, ownerId: input.ownerId, draftId: input.draftId };
  return runAiRequest(
    { traces: deps.traces, ids: deps.ids, nowMs: deps.clock.nowMs },
    {
      requestId: input.traceId,
      ...(input.signal ? { signal: input.signal } : {}),
      timeoutMs: deps.requestTimeoutMs,
      start: {
        campaignId: null,
        subject,
        actorId: input.ownerId,
        purpose: 'campaign-preparation',
        capability: 'campaign-preparation',
        scope: `WORKSHOP:${input.ownerId}`,
        sourceIds: [input.jobId],
        sessionId: input.sessionId,
      },
      providers: deps.router
        .providersFor('campaign-preparation')
        .filter((provider) => provider.kind === 'remote'),
      fallback: {
        build: (repair) => ({
          capability: 'campaign-preparation',
          system: input.system,
          prompt:
            repair === null
              ? input.prompt
              : `${input.prompt}\n<repair-data>${JSON.stringify(repair)}</repair-data>`,
          output: input.output,
          task: { kind: 'campaign-preparation', stage: input.stage, repair },
        }),
        validate: input.validate,
      },
      noStart: () => ({
        status: 'AI_UNAVAILABLE',
        value: null,
        traceId: null,
        provider: null,
        model: null,
        issues: ['NO_DURABLE_START'],
        attempts: [],
      }),
      freeze: (result, traceId) => {
        const response = resultOf(traceId, result);
        const trace: CampaignPreparationTraceView = {
          traceId,
          campaignId: null,
          subject,
          actorId: input.ownerId,
          purpose: 'campaign-preparation',
          capability: 'campaign-preparation',
          scope: `WORKSHOP:${input.ownerId}`,
          sourceIds: [input.jobId],
          input: '',
          jobId: input.jobId,
          stage: input.stage,
          status: response.status,
          attempts: response.attempts,
          issues: response.issues,
          canonicalEvents: [],
          createdAt: deps.clock.now(),
        };
        return { response, trace };
      },
    },
  );
}
