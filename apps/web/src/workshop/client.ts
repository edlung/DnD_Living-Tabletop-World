import type { z } from 'zod';

import { probeWorkshop, workshopRequest } from './transport.ts';

export type WorkshopResult<T, C = never> =
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'conflict'; readonly details?: C }
  | {
      readonly kind: 'signed-out' | 'failed' | 'missing' | 'unavailable' | 'cancelled';
    };

/** Session changes invalidate this entire client, including transports that ignore abort. */
export class WorkshopClient {
  readonly #ownerId: string;
  readonly #ended: () => void;
  readonly #request: typeof workshopRequest;
  readonly #probe: typeof probeWorkshop;
  readonly #controllers = new Set<AbortController>();
  #active = true;

  constructor(
    ownerId: string,
    onEnded: () => void,
    request = workshopRequest,
    probe = probeWorkshop,
  ) {
    this.#ownerId = ownerId;
    this.#ended = onEnded;
    this.#request = request;
    this.#probe = probe;
  }

  release(): void {
    this.#active = false;
    for (const controller of this.#controllers) controller.abort();
    this.#controllers.clear();
  }

  open(): void {
    this.#active = true;
  }

  request<T, C = never>(
    path: string,
    schema: z.ZodType<T>,
    options: {
      readonly body?: object;
      readonly signal?: AbortSignal;
      readonly conflictSchema?: z.ZodType<C>;
    } = {},
  ): Promise<WorkshopResult<T, C>> {
    return this.#perform(
      path,
      async (response) => {
        const body: unknown = await response.json();
        const parsed = schema.safeParse(body);
        return parsed.success ? { kind: 'ready', value: parsed.data } : { kind: 'failed' };
      },
      options,
    );
  }

  bytes(path: string, signal: AbortSignal): Promise<WorkshopResult<Blob>> {
    return this.#perform(
      path,
      async (response) => {
        const blob = await response.blob();
        return ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(blob.type)
          ? { kind: 'ready', value: blob }
          : { kind: 'failed' };
      },
      { signal },
    );
  }

  async #perform<T, C = never>(
    path: string,
    decode: (response: Response) => Promise<WorkshopResult<T>>,
    options: {
      readonly body?: object;
      readonly signal?: AbortSignal;
      readonly conflictSchema?: z.ZodType<C>;
    },
  ): Promise<WorkshopResult<T, C>> {
    if (!this.#active || options.signal?.aborted) return { kind: 'cancelled' };
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.#controllers.add(controller);
    const cancelled = () => !this.#active || controller.signal.aborted;
    try {
      const response = await this.#request(path, options.body, controller.signal, this.#ownerId);
      if (cancelled()) return { kind: 'cancelled' };
      if (response?.status === 401) return this.#end();
      if (response?.status === 409) {
        const identity = await this.#probe(controller.signal);
        if (cancelled()) return { kind: 'cancelled' };
        if (
          identity.kind === 'signed-out' ||
          (identity.kind === 'signed-in' && identity.ownerId !== this.#ownerId)
        )
          return this.#end();
        if (identity.kind !== 'signed-in') return { kind: 'failed' };
        if (options.conflictSchema) {
          try {
            const body: unknown = await response.json();
            if (cancelled()) return { kind: 'cancelled' };
            const parsed = options.conflictSchema.safeParse(body);
            return parsed.success
              ? { kind: 'conflict', details: parsed.data }
              : { kind: 'conflict' };
          } catch {
            return { kind: cancelled() ? 'cancelled' : 'conflict' };
          }
        }
        return { kind: 'conflict' };
      }
      if (response?.status === 404) return { kind: 'missing' };
      if (response?.status === 422) return { kind: 'unavailable' };
      if (!response?.ok) return { kind: 'failed' };
      let decoded: WorkshopResult<T>;
      try {
        decoded = await decode(response);
      } catch {
        return { kind: 'failed' };
      }
      if (cancelled()) return { kind: 'cancelled' };
      return decoded;
    } finally {
      this.#controllers.delete(controller);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  #end(): WorkshopResult<never> {
    this.release();
    this.#ended();
    return { kind: 'signed-out' };
  }
}
