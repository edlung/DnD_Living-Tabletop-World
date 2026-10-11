import { ProviderError, type ProviderPayload, type ProviderResponse } from '@ltw/ai';

/**
 * The raw remote adapter port (docs/STAGE_300_REMEDIATION_DESIGN.md §1; docs/adr/0032-live-ai.md,
 * checkpoint B1). `prepare` builds the complete serialized body (adapter system text, tool,
 * schema, framing, and any cache metadata) without transport or credentials; `dispatch` sends that
 * exact body. A raw adapter is not a routed provider: only the admission wrapper (B2) may dispatch
 * it, after reserving against the prepared body. Raw adapter unit tests call it directly with an
 * injected `fetch`; runtime composition constructs one only inside an admitted wrapper (B2).
 */
export interface PreparedRequest {
  readonly provider: string;
  readonly model: string;
  readonly url: string;
  /** The structured-output tool the response must call. */
  readonly toolName: string;
  /** The exact UTF-8 request body `dispatch` sends, byte for byte. */
  readonly body: string;
}

export interface RawRemoteProvider {
  readonly id: string;
  readonly model: string;
  /** Builds the body from the payload only: accounting metadata is never serialized. */
  prepare(request: ProviderPayload): PreparedRequest;
  /**
   * Sends `prepared` (only one this adapter prepared). `onStart` runs synchronously immediately
   * before transport is invoked; a failure before it is `TRANSPORT_NOT_STARTED`, any failure after
   * it (including one of `onStart` itself) is post-start uncertainty. `deadlineAtMs` is the whole
   * request's monotonic deadline (`performance.now()` milliseconds): the admission wrapper always
   * passes it; only raw adapter unit tests may leave it unbounded.
   */
  dispatch(
    prepared: PreparedRequest,
    signal: AbortSignal,
    onStart: () => void,
    deadlineAtMs?: number,
  ): Promise<ProviderResponse>;
}

/** Issues frozen prepared requests and recognizes only its own. */
export function preparedRequests() {
  const issued = new WeakSet<PreparedRequest>();
  return {
    issue(prepared: PreparedRequest): PreparedRequest {
      const frozen = Object.freeze({ ...prepared });
      issued.add(frozen);
      return frozen;
    },
    owns: (prepared: PreparedRequest): boolean => issued.has(prepared),
  };
}

const notStarted = (message: string) => new ProviderError('TRANSPORT_NOT_STARTED', message);

export interface SendOptions {
  readonly prepared: PreparedRequest;
  /** Builds headers, revealing the key; runs before the start boundary. */
  readonly headers: () => Record<string, string>;
  readonly signal: AbortSignal;
  readonly onStart: () => void;
  /** The attempt's own bound, clamped to the time left before `deadlineAtMs`. */
  readonly timeoutMs: number;
  /** The whole request's monotonic deadline; absent only in raw adapter unit tests. */
  readonly deadlineAtMs: number | undefined;
  readonly fetch: typeof fetch | undefined;
}

/**
 * Posts the prepared body and returns the response JSON. Errors carry a fixed code and message
 * only: never the key, the request, the response body or a transport error (no `cause`). The
 * caller's abort is `CALLER_CANCELLED`, even when the attempt's own timeout coincides.
 *
 * The start boundary (docs/STAGE_300_REMEDIATION_DESIGN.md §1; docs/adr/0032-live-ai.md, B2) is
 * the call of `onStart`, made synchronously immediately before `fetch`. Only a failure strictly
 * before it (an already aborted caller, an unreadable key) is `TRANSPORT_NOT_STARTED`, the one
 * proof that lets an admitted reservation be released. Once `onStart` has been called everything is
 * post-dispatch uncertainty, even when `fetch` is then not invoked: a throwing hook is `UNAVAILABLE`
 * and a caller who went away inside it is `CALLER_CANCELLED`, and both keep the hold. Redirects are
 * refused (`redirect: 'error'`), so neither the key nor the body is ever re-sent elsewhere.
 *
 * The caller has gone when its signal has aborted or the monotonic clock has reached its deadline,
 * whichever comes first (B2 repair 1): the signal is set by a timer that can run late, so the clock
 * is read at every check. The attempt's own timeout is clamped to the time left.
 */
export async function sendPrepared(options: SendOptions): Promise<unknown> {
  const deadlineAtMs = options.deadlineAtMs ?? Number.POSITIVE_INFINITY;
  // A function, not a narrowed property: other code may abort the signal between checks.
  const callerGone = () => options.signal.aborted || performance.now() >= deadlineAtMs;
  if (callerGone()) throw notStarted('caller cancelled before dispatch');
  let headers: Record<string, string>;
  try {
    headers = options.headers();
  } catch {
    throw notStarted('provider credentials unavailable');
  }
  if (callerGone()) throw notStarted('caller cancelled before dispatch');
  // Resolved per call, so a replaced global `fetch` (a test trap) is the one used.
  const send = options.fetch ?? globalThis.fetch;
  const timeout = new AbortController();
  const timer = setTimeout(
    () => {
      timeout.abort();
    },
    Math.max(0, Math.min(options.timeoutMs, Math.ceil(deadlineAtMs - performance.now()))),
  );
  const signal = AbortSignal.any([timeout.signal, options.signal]);
  const stopped = () =>
    callerGone()
      ? new ProviderError('CALLER_CANCELLED', 'caller cancelled')
      : new ProviderError('TIMEOUT', 'provider timed out');
  try {
    // The start boundary: from here on, every failure is uncertain.
    try {
      options.onStart();
    } catch {
      throw new ProviderError('UNAVAILABLE', 'start hook failed');
    }
    if (callerGone()) throw new ProviderError('CALLER_CANCELLED', 'caller cancelled');
    let response: Response;
    try {
      response = await send(options.prepared.url, {
        method: 'POST',
        headers,
        body: options.prepared.body,
        redirect: 'error',
        signal,
      });
    } catch {
      throw signal.aborted || callerGone()
        ? stopped()
        : new ProviderError('UNAVAILABLE', 'provider unreachable');
    }
    if (!response.ok) {
      // The error body is never read: it may echo the request.
      void response.body?.cancel().catch(() => undefined);
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(
        retryable ? 'UNAVAILABLE' : 'BAD_RESPONSE',
        `provider responded ${String(response.status)}`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw signal.aborted || callerGone()
        ? stopped()
        : new ProviderError('BAD_RESPONSE', 'provider output unreadable');
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Throws when `body` is not a JSON object: nothing can be classified from it. */
export function responseObject(body: unknown): Readonly<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ProviderError('BAD_RESPONSE', 'provider output unreadable');
  }
  return body as Readonly<Record<string, unknown>>;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/** A provider-returned identifier (model, request ID), only when it is a safe token. */
export const safeIdentifier = (value: unknown): string | null =>
  typeof value === 'string' && IDENTIFIER.test(value) ? value : null;
