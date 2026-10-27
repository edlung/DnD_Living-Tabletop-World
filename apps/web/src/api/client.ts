import type { SessionResponse } from '@ltw/contracts';

/**
 * How the browser's requests say who it is (docs/adr/0036-production-sign-in.md §7):
 * - `persona`: a development persona's bearer token (ADR 0009), entered by hand and held in
 *   memory only; requests carry it in `Authorization` and never send cookies.
 * - `session`: production sign-in. The session cookie is HttpOnly, so script never sees it:
 *   requests go to the same origin with `credentials: 'same-origin'` and no `Authorization`.
 *   The cookie is the browser's, not the tab's (docs/STAGE_340_DESIGN.md "Part B review
 *   fixes"): a 401 means the session ended (sign-out, expiry, the DM's revocation) and
 *   `onSignedOut` hears of every such answer, the live stream's included; a 403 or 404 — or the
 *   live stream refused, or closed as `gone` or `forbidden` — may mean another tab changed the
 *   sign-in, and `onDoubt` hears of it. The screens tell `onIdentity` every identity (the
 *   campaign's `session` view) they read.
 */
export type Connection =
  | { readonly kind: 'persona'; readonly campaignId: string; readonly token: string }
  | {
      readonly kind: 'session';
      readonly campaignId: string;
      readonly onSignedOut: () => void;
      readonly onDoubt: () => void;
      readonly onIdentity: (identity: SessionResponse) => void;
    };

/** The credential part of a request to the API for this connection. */
export function credentialOptions(connection: Connection): {
  readonly headers: Readonly<Record<string, string>>;
  readonly credentials: RequestCredentials;
} {
  return connection.kind === 'persona'
    ? { headers: { Authorization: `Bearer ${connection.token}` }, credentials: 'omit' }
    : { headers: {}, credentials: 'same-origin' };
}

/** Fixed messages only: never echo an API error body, URL, or credential. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, signedIn: Connection['kind'] = 'persona') {
    super(
      status === 401
        ? signedIn === 'session'
          ? 'You are signed out.'
          : 'Your access token was not accepted. Leave the session to reconnect.'
        : status === 403
          ? 'This perspective is not available to your account.'
          : status === 404
            ? 'This information is not available in the current view.'
            : 'The world could not be reached. Please try again.',
    );
    this.status = status;
  }
}

export class WorldApi {
  private readonly connection: Connection;
  readonly perspective: string;
  private readonly effectivePerspective: string;
  private readonly transport: typeof fetch;
  constructor(
    connection: Connection,
    perspective: string,
    effectivePerspective: string = perspective,
    transport: typeof fetch = fetch,
  ) {
    this.connection = connection;
    this.perspective = perspective;
    this.effectivePerspective = effectivePerspective;
    this.transport = transport;
  }

  private failure(status: number): ApiError {
    return new ApiError(status, this.connection.kind);
  }

  private async response(
    path: string,
    signal: AbortSignal,
    scoped: boolean,
    options?: {
      readonly parameters?: Readonly<Record<string, string>>;
      readonly body?: unknown;
      readonly acceptedStatuses?: readonly number[];
    },
  ): Promise<Response> {
    const search = new URLSearchParams(options?.parameters);
    if (scoped) search.set('perspective', this.perspective);
    const query = search.size ? `?${search.toString()}` : '';
    const credential = credentialOptions(this.connection);
    let response: Response;
    try {
      const transport = this.transport;
      response = await transport(
        `/api/campaigns/${encodeURIComponent(this.connection.campaignId)}/${path}${query}`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          headers: {
            ...credential.headers,
            ...(options?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(options?.body === undefined
            ? {}
            : { method: 'POST', body: JSON.stringify(options.body) }),
          cache: 'no-store',
          credentials: credential.credentials,
          redirect: 'error',
        },
      );
    } catch {
      throw this.failure(0);
    }
    if (this.connection.kind === 'session') {
      // The session ended (signed out elsewhere, expired, revoked): the screen says so at once.
      if (response.status === 401) this.connection.onSignedOut();
      // Refused: perhaps another tab changed this browser's sign-in. The screen asks the server.
      else if (response.status === 403 || response.status === 404) this.connection.onDoubt();
    }
    if (!response.ok && !options?.acceptedStatuses?.includes(response.status))
      throw this.failure(response.status);
    return response;
  }

  async get<T>(
    path: string,
    signal: AbortSignal,
    scoped = true,
    parameters?: Readonly<Record<string, string>>,
  ): Promise<T> {
    const response = await this.response(
      path,
      signal,
      scoped,
      parameters ? { parameters } : undefined,
    );
    try {
      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null) throw this.failure(0);
      // A mismatched envelope fails closed, including PLAYER's resolved label.
      if (scoped && (!('perspective' in data) || data.perspective !== this.effectivePerspective)) {
        throw this.failure(0);
      }
      return data as T;
    } catch {
      throw this.failure(0);
    }
  }

  /** Writes are explicit; callers retain the command ID across uncertain retries. */
  async post<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
    const response = await this.response(path, signal, false, {
      body,
      acceptedStatuses: [409, 422],
    });
    try {
      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || 'error' in data)
        throw this.failure(response.status);
      return data as T;
    } catch (error) {
      // A refusal keeps its status so callers can tell a conflict from a lost response.
      if (error instanceof ApiError) throw error;
      throw this.failure(0);
    }
  }

  /**
   * An image's bytes. A picture chosen for a past time (`at`, a Chronicle page or a flashback) is
   * fetched for that time: the server serves only what presentation could choose then (Gate 06).
   */
  async image(contentHash: string, signal: AbortSignal, at: number | null = null): Promise<Blob> {
    const response = await this.response(
      `assets/content/${encodeURIComponent(contentHash)}`,
      signal,
      true,
      at === null ? undefined : { parameters: { at: String(at) } },
    );
    const blob = await response.blob();
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(blob.type)) {
      throw this.failure(0);
    }
    return blob;
  }
}
