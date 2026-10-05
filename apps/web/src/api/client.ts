export interface Connection {
  readonly campaignId: string;
  readonly token: string;
}

/** Fixed messages only: never echo an API error body, URL, or credential. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(
      status === 401
        ? 'Your access token was not accepted. Leave the session to reconnect.'
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
    let response: Response;
    try {
      const transport = this.transport;
      response = await transport(
        `/api/campaigns/${encodeURIComponent(this.connection.campaignId)}/${path}${query}`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          headers: {
            Authorization: `Bearer ${this.connection.token}`,
            ...(options?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(options?.body === undefined
            ? {}
            : { method: 'POST', body: JSON.stringify(options.body) }),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        },
      );
    } catch {
      throw new ApiError(0);
    }
    if (!response.ok && !options?.acceptedStatuses?.includes(response.status))
      throw new ApiError(response.status);
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
      if (typeof data !== 'object' || data === null) throw new ApiError(0);
      // A mismatched envelope fails closed, including PLAYER's resolved label.
      if (scoped && (!('perspective' in data) || data.perspective !== this.effectivePerspective)) {
        throw new ApiError(0);
      }
      return data as T;
    } catch {
      throw new ApiError(0);
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
        throw new ApiError(response.status);
      return data as T;
    } catch {
      throw new ApiError(0);
    }
  }

  async image(contentHash: string, signal: AbortSignal): Promise<Blob> {
    const response = await this.response(
      `assets/content/${encodeURIComponent(contentHash)}`,
      signal,
      true,
    );
    const blob = await response.blob();
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(blob.type)) {
      throw new ApiError(0);
    }
    return blob;
  }
}
