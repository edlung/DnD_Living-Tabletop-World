/**
 * Test support: an injected `fetch` that records each call and answers as told. Raw adapter tests
 * use it; nothing here reaches the network.
 */
export interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
  /** The request body exactly as sent. */
  readonly body: string;
}

export function fakeFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    const call = { url, init, body: typeof init.body === 'string' ? init.body : '' };
    calls.push(call);
    try {
      return Promise.resolve(respond(call));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('fetch failed'));
    }
  }) as typeof fetch;
  return { calls, fetchImpl };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A response that settles only when the request's signal aborts, then rejects like `fetch`. */
export const hanging = ({ init }: FetchCall) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
