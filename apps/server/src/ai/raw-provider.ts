import { ProviderError, type ProviderRequest, type ProviderResponse } from '@ltw/ai';

/**
 * The raw remote adapter port (docs/STAGE_300_REMEDIATION_DESIGN.md §1; docs/adr/0032-live-ai.md,
 * checkpoint B1). `prepare` builds the complete serialized body (adapter system text, tool,
 * schema, framing, and any cache metadata) without transport or credentials; `dispatch` sends that
 * exact body. A raw adapter is not a routed provider: only the admission wrapper (B2) may dispatch
 * it, after reserving against the prepared body. Raw adapter unit tests call it directly with an
 * injected `fetch`; runtime and evaluation composition never construct one at B1.
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
  prepare(request: ProviderRequest): PreparedRequest;
  /**
   * Sends `prepared` (only one this adapter prepared). `onStart` runs synchronously immediately
   * before transport is invoked; a failure before it is `TRANSPORT_NOT_STARTED`, any failure after
   * it is post-start uncertainty.
   */
  dispatch(
    prepared: PreparedRequest,
    signal: AbortSignal,
    onStart: () => void,
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
  /** The attempt's own bound; the caller's signal stops it too. */
  readonly timeoutMs: number;
  readonly fetch: typeof fetch | undefined;
}

/**
 * Posts the prepared body and returns the response JSON. Errors carry a fixed code and message
 * only: never the key, the request, the response body or a transport error (no `cause`). The
 * caller's abort is `CALLER_CANCELLED`, even when the attempt's own timeout coincides.
 *
 * The caller's signal is rechecked after each step that runs other code (reading the key, the
 * start hook) and immediately before `fetch`. While transport has not been invoked, cancellation
 * ends the attempt as `TRANSPORT_NOT_STARTED`, the proof that nothing was sent (design §3); no
 * `fetch` follows. Nothing asynchronous runs between the last check and `fetch` (B1 repair 1).
 */
export async function sendPrepared(options: SendOptions): Promise<unknown> {
  // A function, not a narrowed property: other code may abort the signal between checks.
  const callerGone = () => options.signal.aborted;
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
  const timer = setTimeout(() => {
    timeout.abort();
  }, options.timeoutMs);
  const signal = AbortSignal.any([timeout.signal, options.signal]);
  const stopped = () =>
    callerGone()
      ? new ProviderError('CALLER_CANCELLED', 'caller cancelled')
      : new ProviderError('TIMEOUT', 'provider timed out');
  try {
    try {
      options.onStart();
    } catch {
      throw notStarted('start hook failed');
    }
    if (callerGone()) throw notStarted('caller cancelled before dispatch');
    let response: Response;
    try {
      response = await send(options.prepared.url, {
        method: 'POST',
        headers,
        body: options.prepared.body,
        signal,
      });
    } catch {
      throw signal.aborted ? stopped() : new ProviderError('UNAVAILABLE', 'provider unreachable');
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
      throw signal.aborted
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
