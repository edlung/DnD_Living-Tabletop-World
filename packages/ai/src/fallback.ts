import type { AiAttemptView, AttemptKind } from '@ltw/contracts';

import {
  answerOf,
  billingOf,
  factsOf,
  isDeclineEnvelope,
  serialize,
  type Answer,
} from './fallback-answer.ts';
import {
  ProviderError,
  failureCode,
  type DenialCode,
  type ProviderKind,
  type ProviderPayload,
  type ProviderRequest,
  type RepairNote,
  type RequestAccounting,
  type RoutedProvider,
  type SuspectCode,
} from './providers.ts';

/**
 * The fallback policy (owner decision, docs/adr/0017-ai-gateway.md §5, with the reviewed
 * transitions of docs/adr/0032-live-ai.md, checkpoint B1), for every AI use case.
 * - Provider failure (transport outage, refusal, suspect model or billing, initial admission
 *   denial): at most one switch, only from a remote provider to the zero-cost local provider, with
 *   the identical request and no repair note. Never another paid provider; with none, AI_UNAVAILABLE.
 * - Invalid output (schema, references, missing tool, truncation, unreadable JSON, a decline
 *   envelope where none is valid): one repair on the same remote provider, given its output and
 *   issues; still invalid, INVALID_OUTPUT. A denied repair keeps the previous output and ends
 *   INVALID_OUTPUT. The local provider is never repaired: a local-only route, like the local switch,
 *   makes exactly one local call, and its invalid output is final.
 * - A validated intent decline is terminal INVALID_OUTPUT: no repair, no switch.
 * - Once the caller's whole-request signal aborts, nothing new is dispatched and late output is
 *   discarded: AI_UNAVAILABLE with CALLER_CANCELLED, even when an attempt's own timeout coincided.
 *   The signal is rechecked after every callback (`build`, each progress notice, `validate`) and
 *   immediately before invoking a provider, so cancellation from any of them invokes nothing more
 *   and selects no usable result.
 * - Code the caller supplies (`build`, `validate`, `nowMs`, the progress listener) is not a
 *   provider: its exception never becomes a recorded attempt, a repair or a switch (B1 repair 2).
 *   Before an invocation the exception propagates and nothing is recorded (a delivered `start` is
 *   withdrawn with `abandoned`). After an invocation exactly one attempt records what the provider
 *   did (a throwing `validate` gives `INTERNAL_ERROR`, with only safe metadata), its `end` is
 *   published once, and then the first such exception propagates.
 * - An invoked provider that resolves no well-formed response (not an object, an unknown kind or
 *   code, unreadable) is an uncertain `BAD_RESPONSE` provider failure with no model, usage or
 *   output, or CALLER_CANCELLED once the caller has gone (B1 repair 3).
 * - Each invocation gets a fresh attempt ID and carries the request's trusted accounting identity
 *   (B2); its `onStart` hook counts once while the attempt runs and is ignored afterwards (B2).
 * Every attempt is built from the same context by `build`, so no fallback widens what the
 * provider sees, and nothing here can commit anything.
 */
export type OutputCheck<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly issues: readonly string[];
      /** A validated deliberate decline (intents only): terminal, never repaired. */
      readonly decline?: string;
    };

/** Fixed codes of an INVALID_OUTPUT result. */
export type InvalidCode = 'NO_PROPOSAL' | 'INVALID_STRUCTURED_OUTPUT' | DenialCode;
/**
 * Fixed codes of an AI_UNAVAILABLE result: the first provider failure, the one that decided the
 * outcome-table row (a remote refusal stays PROVIDER_REFUSAL even if the local switch then fails),
 * or CALLER_CANCELLED once the caller has gone.
 */
export type UnavailableCode =
  'PROVIDER_FAILURE' | 'PROVIDER_REFUSAL' | SuspectCode | DenialCode | 'CALLER_CANCELLED';

export type FallbackResult<T> =
  | {
      readonly status: 'VALID';
      readonly value: T;
      readonly attempts: readonly AiAttemptView[];
    }
  | {
      readonly status: 'INVALID_OUTPUT';
      readonly issues: readonly string[];
      readonly code: InvalidCode;
      /** The validated decline reason (intents), else null. */
      readonly decline: string | null;
      readonly attempts: readonly AiAttemptView[];
    }
  | {
      readonly status: 'AI_UNAVAILABLE';
      /** Null only when no provider is routed. */
      readonly code: UnavailableCode | null;
      readonly attempts: readonly AiAttemptView[];
    };

/**
 * Attempt transitions as they happen, synchronously, so a caller that stops waiting knows what
 * was in flight without awaiting it. `start` announces the next invocation, and exactly one of
 * `abandoned` or `end` closes it: `abandoned` when the provider was not invoked after all (the
 * caller went away, or the `start` listener threw; no attempt is recorded), `end` with the one
 * recorded attempt of an invocation. `dispatched` is the provider's own start hook (transport may
 * begin; a TRANSPORT_NOT_STARTED end proves it did not).
 */
export type AttemptProgress =
  | {
      readonly type: 'start';
      readonly provider: string;
      readonly providerKind: ProviderKind;
      readonly kind: AttemptKind;
      readonly attemptId: string;
      readonly startedMs: number;
    }
  | { readonly type: 'abandoned' }
  | { readonly type: 'dispatched' }
  | { readonly type: 'end'; readonly attempt: AiAttemptView };

/** The request's accounting identity; the policy adds each attempt's ID and kind. */
export interface FallbackAccounting extends Omit<RequestAccounting, 'attemptId' | 'attemptKind'> {
  /** A fresh unique attempt ID per invocation (a UUID in the server). */
  readonly newAttemptId: () => string;
}

export interface FallbackDeps<T> {
  readonly providers: readonly RoutedProvider[];
  readonly build: (repair: RepairNote | null) => ProviderPayload;
  readonly accounting: FallbackAccounting;
  /** The whole request's monotonic deadline, passed to every attempt; none is unbounded. */
  readonly deadlineAtMs?: number;
  readonly validate: (output: unknown) => OutputCheck<T>;
  /** Milliseconds, for latency only. */
  readonly nowMs: () => number;
  /** True only for intents, whose decline envelope is valid output; elsewhere it is the wrong kind. */
  readonly declines?: boolean;
  /** The caller's whole-request signal. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: AttemptProgress) => void;
}

/** The fixed issue of a decline envelope sent to a capability without one. */
export const WRONG_OUTPUT_KIND = 'WRONG_OUTPUT_KIND';

/**
 * The attempt code when the caller's own `validate` threw on a provider's response: the output is
 * discarded, safe metadata kept, and the run rejects with that exception (no trace is written).
 */
export const INTERNAL_ERROR = 'INTERNAL_ERROR';

const NEVER_ABORTED = new AbortController().signal;

/** An invoked provider that resolved no well-formed response: an uncertain provider failure. */
const NO_RESPONSE = new ProviderError('BAD_RESPONSE', 'provider resolved no response');

/** What happens after an invocation's one attempt is recorded. */
type Next<T> =
  | { readonly then: 'valid'; readonly value: T }
  | { readonly then: 'decline'; readonly issues: readonly string[]; readonly decline: string }
  | { readonly then: 'denied-repair'; readonly code: DenialCode }
  | { readonly then: 'cancel' }
  | { readonly then: 'invalid'; readonly output: unknown; readonly issues: readonly string[] }
  | { readonly then: 'fail'; readonly failure: UnavailableCode };

export async function runWithFallback<T>(deps: FallbackDeps<T>): Promise<FallbackResult<T>> {
  const attempts: AiAttemptView[] = [];
  const signal = deps.signal ?? NEVER_ABORTED;
  const deadlineAtMs = deps.deadlineAtMs ?? Number.POSITIVE_INFINITY;
  // A function, not a narrowed property: the signal can abort while an attempt is awaited. The
  // monotonic deadline is read too: its abort timer can run late (B2 repair 1).
  const callerGone = () => signal.aborted || performance.now() >= deadlineAtMs;
  /** Publishes a notice; a throwing listener is returned, never thrown here. */
  const notify = (event: AttemptProgress): { readonly error: unknown } | null => {
    try {
      deps.onProgress?.(event);
      return null;
    } catch (error) {
      return { error };
    }
  };
  const cancelled = (): FallbackResult<T> => ({
    status: 'AI_UNAVAILABLE',
    code: 'CALLER_CANCELLED',
    attempts,
  });
  let index = 0;
  let kind: AttemptKind = 'initial';
  let repair: RepairNote | null = null;
  let switched = false;
  let repaired = false;
  let previousIssues: readonly string[] = [];
  let firstFailure: UnavailableCode | null = null;

  for (;;) {
    const provider = deps.providers[index];
    if (!provider) return { status: 'AI_UNAVAILABLE', code: firstFailure, attempts };
    if (callerGone()) return cancelled();

    // Before the invocation boundary: an exception from `nowMs`, the attempt-ID source or `build`
    // propagates as is.
    const started = deps.nowMs();
    const attemptId = deps.accounting.newAttemptId();
    const { requestId, campaignId, capability, sessionId } = deps.accounting;
    const request: ProviderRequest = {
      ...deps.build(repair),
      accounting: { requestId, campaignId, capability, sessionId, attemptId, attemptKind: kind },
    };
    if (callerGone()) return cancelled();
    const startFailure = notify({
      type: 'start',
      provider: provider.id,
      providerKind: provider.kind,
      kind,
      attemptId,
      startedMs: started,
    });
    if (startFailure !== null || callerGone()) {
      // The announced invocation does not happen: withdraw it; the first exception wins.
      const withdrawFailure = notify({ type: 'abandoned' });
      const failure = startFailure ?? withdrawFailure;
      if (failure !== null) throw failure.error;
      return cancelled();
    }

    // The invocation boundary: from here exactly one attempt is recorded for this invocation, and
    // exceptions from the caller's code wait until it is (`late`), then the first propagates.
    const late: unknown[] = [];
    // The start hook counts once while this attempt runs; a call after it settled is ignored.
    const hook = { live: true, fired: false };
    let settled: { readonly answer: Answer } | { readonly error: unknown };
    try {
      const resolved: unknown = await provider.generate(request, {
        signal,
        deadlineAtMs,
        onStart: () => {
          if (!hook.live || hook.fired) return;
          hook.fired = true;
          const failure = notify({ type: 'dispatched' });
          if (failure !== null) late.push(failure.error);
        },
      });
      // Read once; a non-response is an uncertain failure of this invoked attempt.
      const answer = answerOf(resolved);
      settled = answer === null ? { error: NO_RESPONSE } : { answer };
    } catch (error) {
      settled = { error };
    }
    hook.live = false;
    let latencyMs = 0;
    try {
      latencyMs = Math.round(deps.nowMs() - started);
    } catch (error) {
      late.push(error);
    }
    const base = { provider: provider.id, kind, latencyMs, attemptId };
    /** The one attempt for this invocation and what follows it. Pure but for `validate`. */
    const settle = (
      outcome: { readonly answer: Answer } | { readonly error: unknown },
    ): [AiAttemptView, Next<T>] => {
      const empty = { issues: [], output: null } as const;
      if ('error' in outcome) {
        const code = failureCode(outcome.error);
        const gone = callerGone();
        const error = gone && code !== 'TRANSPORT_NOT_STARTED' ? 'CALLER_CANCELLED' : code;
        return [
          { ...base, model: null, usage: null, outcome: 'error', error, ...empty },
          gone ? { then: 'cancel' } : { then: 'fail', failure: 'PROVIDER_FAILURE' },
        ];
      }
      const response = outcome.answer;
      const facts = factsOf(response);
      const cancelledAttempt: [AiAttemptView, Next<T>] = [
        { ...base, ...facts, outcome: 'error', error: 'CALLER_CANCELLED', ...empty },
        { then: 'cancel' },
      ];
      // Late output is discarded; only safe metadata stays.
      if (callerGone()) return cancelledAttempt;
      switch (response.kind) {
        case 'denied':
          return [
            { ...base, ...facts, outcome: 'error', error: response.code, ...empty },
            kind === 'repair'
              ? { then: 'denied-repair', code: response.code }
              : { then: 'fail', failure: response.code },
          ];
        case 'refusal':
        case 'suspect': {
          const code = response.kind === 'refusal' ? 'PROVIDER_REFUSAL' : response.code;
          return [
            { ...base, ...facts, outcome: 'error', error: code, ...empty },
            { then: 'fail', failure: code },
          ];
        }
        case 'malformed':
          return [
            {
              ...base,
              ...facts,
              outcome: 'invalid',
              error: null,
              issues: [response.code],
              output: null,
            },
            { then: 'invalid', output: null, issues: [response.code] },
          ];
        case 'output': {
          let check: OutputCheck<T>;
          if (!deps.declines && isDeclineEnvelope(response.output)) {
            check = { ok: false, issues: [WRONG_OUTPUT_KIND] };
          } else {
            try {
              check = deps.validate(response.output);
            } catch (error) {
              late.push(error);
              return [
                { ...base, ...facts, outcome: 'error', error: INTERNAL_ERROR, ...empty },
                { then: 'cancel' },
              ];
            }
            // Cancellation during validation wins before any result is selected.
            if (callerGone()) return cancelledAttempt;
          }
          const attempt: AiAttemptView = {
            ...base,
            ...facts,
            outcome: check.ok ? 'valid' : 'invalid',
            error: null,
            issues: check.ok ? [] : check.issues,
            output: serialize(response.output),
          };
          if (check.ok) return [attempt, { then: 'valid', value: check.value }];
          if (check.decline !== undefined) {
            return [attempt, { then: 'decline', issues: check.issues, decline: check.decline }];
          }
          return [attempt, { then: 'invalid', output: response.output, issues: check.issues }];
        }
      }
    };
    const [settledAttempt, next] = settle(settled);
    const attempt: AiAttemptView = {
      ...settledAttempt,
      billing: billingOf(
        provider.kind,
        'answer' in settled
          ? settled
          : { notStarted: failureCode(settled.error) === 'TRANSPORT_NOT_STARTED' },
      ),
    };
    attempts.push(attempt);
    const endFailure = notify({ type: 'end', attempt });
    if (endFailure !== null) late.push(endFailure.error);
    if (late.length > 0) throw late[0];

    switch (next.then) {
      case 'valid':
        return { status: 'VALID', value: next.value, attempts };
      case 'decline':
        return {
          status: 'INVALID_OUTPUT',
          issues: next.issues,
          code: 'NO_PROPOSAL',
          decline: next.decline,
          attempts,
        };
      case 'denied-repair':
        return {
          status: 'INVALID_OUTPUT',
          issues: previousIssues,
          code: next.code,
          decline: null,
          attempts,
        };
      case 'cancel':
        return cancelled();
      case 'invalid':
        if (repaired || provider.kind !== 'remote') {
          return {
            status: 'INVALID_OUTPUT',
            issues: next.issues,
            code: 'INVALID_STRUCTURED_OUTPUT',
            decline: null,
            attempts,
          };
        }
        repaired = true;
        previousIssues = next.issues;
        kind = 'repair';
        repair = { output: next.output, issues: next.issues };
        continue;
      case 'fail': {
        firstFailure ??= next.failure;
        const following = deps.providers[index + 1];
        if (switched || provider.kind !== 'remote' || following?.kind !== 'local') {
          return { status: 'AI_UNAVAILABLE', code: firstFailure, attempts };
        }
        switched = true;
        index += 1;
        kind = 'fallback';
        repair = null;
        continue;
      }
    }
  }
}
