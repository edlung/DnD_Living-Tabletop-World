import type { AiAttemptView, AiTraceView, AttemptKind } from '@ltw/contracts';
import type { IdGenerator } from '@ltw/domain';

import {
  runWithFallback,
  type AttemptProgress,
  type FallbackDeps,
  type FallbackResult,
} from './fallback.ts';
import type { ProviderKind, RoutedProvider } from './providers.ts';
import { EXPIRED, isExpired, openDeadline, untilDeadline } from './request-deadline.ts';
import type { AiRequestStart, AiTraceStore, FrozenOutcome } from './traces.ts';

/**
 * One AI request's lifecycle (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2; docs/adr/0032-live-ai.md,
 * B2), shared by every use case:
 *
 * 1. One whole-request deadline, opened before anything else.
 * 2. A durable request start, bounded by that deadline. Without a confirmed start nothing runs and
 *    the use case answers its no-start response (no trace ID).
 * 3. The fallback policy under the deadline's signal, with the request's trusted accounting
 *    identity. A request without a play session runs only its local provider: no remote attempt is
 *    made or recorded for it.
 * 4. The outcome freeze: the public result and its trace are decided once, synchronously. If the
 *    deadline has passed by then, the cancellation result is frozen instead, with the attempts known
 *    at that moment (one still in flight is recorded as `CALLER_CANCELLED`) and no late output.
 * 5. The frozen outcome and trace are stored together; the caller waits for that at most until its
 *    deadline and then returns exactly the frozen result. A late write can never change it.
 *
 * A rejection (from caller-supplied code) propagates: the request then has a durable start and no
 * outcome, which recovery records later; accounting is the admission wrapper's, not this one's.
 */
export interface LifecycleDeps {
  readonly traces: AiTraceStore;
  readonly ids: IdGenerator;
  /** Milliseconds, for latency only. */
  readonly nowMs: () => number;
}

export interface AiRequestSpec<T, R> {
  /** The whole-request duration in milliseconds; required, positive. */
  readonly timeoutMs: number;
  readonly start: Omit<AiRequestStart, 'requestId'>;
  readonly providers: readonly RoutedProvider[];
  readonly fallback: Pick<FallbackDeps<T>, 'build' | 'validate' | 'declines'>;
  /** The response when no durable start was confirmed; `expired` when the deadline ran out first. */
  readonly noStart: (expired: boolean) => R;
  /** The public response and its trace for a result: pure and synchronous, called exactly once. */
  readonly freeze: (
    result: FallbackResult<T>,
    traceId: string,
  ) => { readonly response: R; readonly trace: AiTraceView };
}

interface Pending {
  readonly provider: string;
  readonly kind: AttemptKind;
  readonly providerKind: ProviderKind;
  readonly attemptId: string;
  readonly startedMs: number;
}

/** What has happened so far, so the deadline can freeze the attempts without awaiting them. */
function attemptTracker(nowMs: () => number) {
  const settled: AiAttemptView[] = [];
  let pending: Pending | null = null;
  return {
    onProgress: (event: AttemptProgress) => {
      if (event.type === 'start') {
        const { provider, providerKind, kind, attemptId, startedMs } = event;
        pending = { provider, providerKind, kind, attemptId, startedMs };
      } else if (event.type === 'abandoned') pending = null;
      else if (event.type === 'end') {
        settled.push(event.attempt);
        pending = null;
      }
    },
    /** The cancellation result: no output survives; an attempt in flight is CALLER_CANCELLED. */
    cancelled: <T>(): FallbackResult<T> => {
      const attempts: AiAttemptView[] = settled.map((attempt) =>
        attempt.outcome === 'valid'
          ? { ...attempt, outcome: 'error', error: 'CALLER_CANCELLED', issues: [], output: null }
          : attempt,
      );
      const inFlight = pending;
      if (inFlight !== null) {
        attempts.push({
          provider: inFlight.provider,
          kind: inFlight.kind,
          model: null,
          outcome: 'error',
          error: 'CALLER_CANCELLED',
          issues: [],
          output: null,
          latencyMs: Math.round(nowMs() - inFlight.startedMs),
          usage: null,
          attemptId: inFlight.attemptId,
          billing:
            inFlight.providerKind === 'local'
              ? { status: 'local', pricingVersion: null, reservedMicros: null, costMicros: '0' }
              : { status: 'unknown', pricingVersion: null, reservedMicros: null, costMicros: null },
        });
      }
      return { status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED', attempts };
    },
  };
}

/** The caller outcome stored with a frozen trace. */
function outcomeOf<T>(result: FallbackResult<T>, trace: AiTraceView): FrozenOutcome {
  return {
    trace,
    status: trace.status,
    provider: result.status === 'VALID' ? (result.attempts.at(-1)?.provider ?? null) : null,
    code: result.status === 'VALID' ? null : result.code,
  };
}

export async function runAiRequest<T, R>(
  deps: LifecycleDeps,
  spec: AiRequestSpec<T, R>,
): Promise<R> {
  const { deadline, close } = openDeadline(spec.timeoutMs);
  try {
    const requestId = deps.ids.next();
    const start: AiRequestStart = { ...spec.start, requestId };
    const started = await untilDeadline(
      deps.traces.start(start, deadline).catch(() => false),
      deadline,
    );
    if (started !== true) return spec.noStart(started === EXPIRED || isExpired(deadline));

    const providers =
      start.sessionId === null
        ? spec.providers.filter((provider) => provider.kind === 'local')
        : spec.providers;
    const tracker = attemptTracker(deps.nowMs);
    const raced = isExpired(deadline)
      ? EXPIRED
      : await untilDeadline(
          runWithFallback({
            ...spec.fallback,
            providers,
            nowMs: deps.nowMs,
            signal: deadline.signal,
            deadlineAtMs: deadline.atMs,
            accounting: {
              requestId,
              campaignId: start.campaignId,
              capability: start.capability,
              sessionId: start.sessionId,
              newAttemptId: () => deps.ids.next(),
            },
            onProgress: tracker.onProgress,
          }),
          deadline,
        );

    // The outcome freeze: decided once, synchronously; an expired request freezes cancellation.
    const result = raced === EXPIRED || isExpired(deadline) ? tracker.cancelled<T>() : raced;
    const frozen = spec.freeze(result, requestId);
    // Waits at most until the caller's deadline; a failed write is a diagnostic limitation only.
    await untilDeadline(
      deps.traces.finalize(outcomeOf(result, frozen.trace), deadline).catch(() => undefined),
      deadline,
    );
    return frozen.response;
  } finally {
    close();
  }
}
