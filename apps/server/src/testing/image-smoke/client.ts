import type { SmokeOptions } from './args.ts';
import type { SmokeStore } from './store.ts';

/**
 * What every smoke step shares (`../image-smoke.ts`): the HTTP client acting as the DM or the
 * player with their development persona tokens, the read-only store, and the clock. A failure is
 * a check that did not hold (exit 1); a refusal is a precondition that did not hold, found before
 * the smoke asked for anything that could cost money (exit 2).
 */
export class SmokeFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeFailure';
  }
}

export class SmokeRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeRefusal';
  }
}

export type Persona = 'dm' | 'player';

export interface Reply {
  readonly status: number;
  readonly contentType: string | null;
  readonly bytes: Uint8Array;
  text(): string;
  json(): unknown;
}

/** One answer's bound; the image job itself is awaited by polling, never by one request. */
const REQUEST_TIMEOUT_MS = 30_000;

export class SmokeClient {
  readonly #base: URL;
  readonly #tokens: Readonly<Record<Persona, string>>;
  readonly #fetch: typeof fetch;

  constructor(base: URL, tokens: Readonly<Record<Persona, string>>, fetchImpl: typeof fetch) {
    this.#base = base;
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
  }

  get(persona: Persona | null, path: string): Promise<Reply> {
    return this.#request(persona, 'GET', path);
  }

  post(persona: Persona, path: string, body: unknown): Promise<Reply> {
    return this.#request(persona, 'POST', path, body);
  }

  async #request(
    persona: Persona | null,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (persona !== null) headers['authorization'] = `Bearer ${this.#tokens[persona]}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    let bytes: Uint8Array;
    try {
      response = await this.#fetch(new URL(path, this.#base), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      throw new SmokeFailure(`${method} ${path}: no answer from the server (${reason})`);
    }
    const text = () => Buffer.from(bytes).toString('utf8');
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes,
      text,
      json: () => JSON.parse(text()) as unknown,
    };
  }
}

/** A refusal's code: a World Engine rejection's, or the fixed API error's. */
export function codeOf(reply: Reply): string {
  try {
    const body = reply.json() as { code?: unknown; error?: { code?: unknown } } | null;
    const code = body?.code ?? body?.error?.code;
    return typeof code === 'string' ? code : 'no code';
  } catch {
    return 'no code';
  }
}

/** The reply's JSON when its status is `expected`; otherwise a failure naming the step. */
export async function expectStatus<T>(
  pending: Reply | Promise<Reply>,
  expected: number,
  step: string,
): Promise<T> {
  const reply = await pending;
  if (reply.status !== expected) {
    throw new SmokeFailure(
      `${step}: expected HTTP ${String(expected)}, got ${String(reply.status)}: ` +
        reply.text().slice(0, 400),
    );
  }
  return reply.json() as T;
}

export interface SmokeContext {
  readonly options: SmokeOptions;
  readonly client: SmokeClient;
  readonly store: SmokeStore;
  readonly log: (line: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  /** Unique per run: the smoke's client command IDs build on it. */
  readonly runId: string;
}

/** `/campaigns/<id><path>` of the smoke's campaign. */
export const campaignPath = (context: SmokeContext, path: string) =>
  `/campaigns/${context.options.campaignId}${path}`;
