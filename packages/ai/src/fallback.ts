import type { AiAttemptView, AttemptKind } from '@ltw/contracts';

import {
  DENIAL_CODES,
  MALFORMED_CODES,
  ProviderError,
  SUSPECT_CODES,
  failureCode,
  type DenialCode,
  type MalformedCode,
  type ProviderRequest,
  type RepairNote,
  type RoutedProvider,
  type SuspectCode,
  type TokenUsage,
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
      readonly kind: AttemptKind;
      readonly startedMs: number;
    }
  | { readonly type: 'abandoned' }
  | { readonly type: 'dispatched' }
  | { readonly type: 'end'; readonly attempt: AiAttemptView };

export interface FallbackDeps<T> {
  readonly providers: readonly RoutedProvider[];
  readonly build: (repair: RepairNote | null) => ProviderRequest;
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

const MAX_OUTPUT_CHARS = 8 * 1024;
const NEVER_ABORTED = new AbortController().signal;

function serialize(output: unknown): string {
  let text: string;
  try {
    // JSON.stringify returns undefined for undefined and functions, despite its type.
    const raw = JSON.stringify(output) as string | undefined;
    text = raw ?? 'undefined';
  } catch {
    text = '"(unserializable output)"';
  }
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}…` : text;
}

/** Whether `output` is a decline envelope; an output whose reading throws is not one. */
function isDeclineEnvelope(output: unknown): boolean {
  try {
    return (
      typeof output === 'object' &&
      output !== null &&
      (output as { readonly kind?: unknown }).kind === 'decline'
    );
  } catch {
    return false;
  }
}

type Facts = Pick<AiAttemptView, 'model' | 'usage'>;

/** A provider's resolution as the policy reads it, copied once with well-formed facts only. */
type Answer =
  | { readonly kind: 'denied'; readonly code: DenialCode }
  | (Facts &
      (
        | { readonly kind: 'output'; readonly output: unknown }
        | { readonly kind: 'refusal' }
        | { readonly kind: 'malformed'; readonly code: MalformedCode }
        | { readonly kind: 'suspect'; readonly code: SuspectCode }
      ));

/** An invoked provider that resolved no well-formed response: an uncertain provider failure. */
const NO_RESPONSE = new ProviderError('BAD_RESPONSE', 'provider resolved no response');

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isOneOf = <C extends string>(codes: readonly C[], value: unknown): value is C =>
  (codes as readonly unknown[]).includes(value);

function usageOf(value: unknown): TokenUsage | null {
  if (typeof value !== 'object' || value === null) return null;
  const { inputTokens, outputTokens } = value as Partial<Record<keyof TokenUsage, unknown>>;
  return isCount(inputTokens) && isCount(outputTokens) ? { inputTokens, outputTokens } : null;
}

/**
 * Reads a resolution once (B1 repair 3). Anything but an object with a known kind (and, where the
 * kind has one, a known code), or a value whose reading throws, is null: a non-response, never a
 * source of model, usage or output. A model or usage that is not well-formed is kept as unknown.
 */
function answerOf(value: unknown): Answer | null {
  try {
    if (typeof value !== 'object' || value === null) return null;
    const fields = value as Readonly<Record<string, unknown>>;
    const kind = fields['kind'];
    const code = fields['code'];
    if (kind === 'denied') return isOneOf(DENIAL_CODES, code) ? { kind, code } : null;
    if (kind !== 'output' && kind !== 'refusal' && kind !== 'malformed' && kind !== 'suspect') {
      return null;
    }
    const model = fields['model'];
    const facts: Facts = {
      model: typeof model === 'string' ? model : null,
      usage: usageOf(fields['usage']),
    };
    switch (kind) {
      case 'output':
        return { kind, output: fields['output'], ...facts };
      case 'refusal':
        return { kind, ...facts };
      case 'malformed':
        return isOneOf(MALFORMED_CODES, code) ? { kind, code, ...facts } : null;
      case 'suspect':
        return isOneOf(SUSPECT_CODES, code) ? { kind, code, ...facts } : null;
    }
  } catch {
    return null;
  }
}

/** A denied attempt was never dispatched: no model, and known zero usage (not unknown). */
const factsOf = (answer: Answer): Facts =>
  answer.kind === 'denied'
    ? { model: null, usage: { inputTokens: 0, outputTokens: 0 } }
    : { model: answer.model, usage: answer.usage };

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
  // A function, not a narrowed property: the signal can abort while an attempt is awaited.
  const callerGone = () => signal.aborted;
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

    // Before the invocation boundary: an exception from `nowMs` or `build` propagates as is.
    const started = deps.nowMs();
    const request = deps.build(repair);
    if (callerGone()) return cancelled();
    const startFailure = notify({ type: 'start', provider: provider.id, kind, startedMs: started });
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
    let settled: { readonly answer: Answer } | { readonly error: unknown };
    try {
      const resolved: unknown = await provider.generate(request, {
        signal,
        onStart: () => {
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
    let latencyMs = 0;
    try {
      latencyMs = Math.round(deps.nowMs() - started);
    } catch (error) {
      late.push(error);
    }
    const base = { provider: provider.id, kind, latencyMs };
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
    const [attempt, next] = settle(settled);
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
