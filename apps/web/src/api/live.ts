import { LIVE_FINAL_REASONS, type LiveCloseReason, type LiveMessage } from '@ltw/contracts';

import type { Connection } from './client.ts';
import { backoffDelay, EventStreamParser, liveMessage } from './live-protocol.ts';

/**
 * The browser end of the live signal (docs/adr/0033-live-session.md §1, §3, §4). The stream
 * is read with `fetch`, never `EventSource`, so the credential stays in the `Authorization`
 * header and out of every URL. Each `ready` (first connection, reconnection, or a new focus
 * or place) and each new `changed` asks for one background refresh, coalesced per 150 ms.
 * A new subscription replaces the old one only once it is ready. Messages of a replaced or
 * abandoned stream are ignored. `unauthenticated` and `forbidden` stop it for good; anything
 * else reconnects after 1 s doubling to 30 s, ±20 %.
 */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface LiveParams {
  readonly perspective: string;
  readonly focus: string | null;
  readonly place: string | null;
}

export interface LiveClientOptions {
  readonly connection: Connection;
  readonly onStatus: (status: LiveStatus) => void;
  /** One background re-read of every shown view. */
  readonly onRefresh: () => void;
  readonly transport?: typeof fetch;
  readonly random?: () => number;
  /** Whether the browser believes it is online. */
  readonly online?: () => boolean;
  readonly timing?: Partial<typeof LIVE_TIMING>;
}

export const LIVE_TIMING = {
  /** Signals arriving within this window refresh once. */
  coalesceMs: 150,
  /** A focus or place that keeps changing subscribes once it settles. */
  settleMs: 150,
  /** Headers and `ready` must arrive within this. */
  connectMs: 15_000,
  /** Three missed 15 s heartbeats mean the stream is gone. */
  idleMs: 45_000,
};

/** One subscription attempt: a generation of the connection, current or stale. */
interface Stream {
  readonly params: LiveParams;
  readonly controller: AbortController;
  ready: boolean;
  lastSeq: number;
  closed: LiveCloseReason | null;
  watchdog: ReturnType<typeof setTimeout> | null;
}

const same = (a: LiveParams | null, b: LiveParams | null) =>
  a !== null &&
  b !== null &&
  a.perspective === b.perspective &&
  a.focus === b.focus &&
  a.place === b.place;

export class LiveClient {
  readonly #options: LiveClientOptions;
  readonly #timing: typeof LIVE_TIMING;
  #desired: LiveParams | null = null;
  #active: Stream | null = null;
  #pending: Stream | null = null;
  #attempt = 0;
  #status: LiveStatus = 'connecting';
  #retry: ReturnType<typeof setTimeout> | null = null;
  #settle: ReturnType<typeof setTimeout> | null = null;
  #coalesce: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;

  constructor(options: LiveClientOptions) {
    this.#options = options;
    this.#timing = { ...LIVE_TIMING, ...options.timing };
  }

  /** Follow these parameters; the first subscription opens at once, later ones settle. */
  subscribe(params: LiveParams): void {
    if (this.#stopped || same(params, this.#desired)) return;
    const first = this.#desired === null;
    this.#desired = params;
    this.#clear('settle');
    if (first) {
      this.#connect();
      return;
    }
    this.#settle = setTimeout(() => {
      this.#settle = null;
      this.#connect();
    }, this.#timing.settleMs);
  }

  /** The browser came back online: try now instead of waiting out the backoff. */
  wake(): void {
    if (this.#stopped || this.#retry === null) return;
    this.#clear('retry');
    this.#connect();
  }

  /** Ends every stream and timer; nothing is reported afterwards. */
  close(): void {
    this.#stopped = true;
    for (const name of ['retry', 'settle', 'coalesce'] as const) this.#clear(name);
    this.#abandon(this.#pending);
    this.#abandon(this.#active);
    this.#pending = null;
    this.#active = null;
  }

  #connect(): void {
    const params = this.#desired;
    if (this.#stopped || params === null) return;
    this.#clear('retry');
    const replaced = this.#pending;
    this.#pending = null;
    this.#abandon(replaced);
    if (same(this.#active?.params ?? null, params)) return;
    const stream: Stream = {
      params,
      controller: new AbortController(),
      ready: false,
      lastSeq: 0,
      closed: null,
      watchdog: null,
    };
    this.#pending = stream;
    if (this.#active === null && this.#status !== 'connecting') this.#report('reconnecting');
    void this.#read(stream);
  }

  async #read(stream: Stream): Promise<void> {
    let refused = false;
    try {
      this.#watch(stream, this.#timing.connectMs);
      const { connection } = this.#options;
      const search = new URLSearchParams({ perspective: stream.params.perspective });
      if (stream.params.focus !== null) search.set('focus', stream.params.focus);
      if (stream.params.place !== null) search.set('place', stream.params.place);
      const transport = this.#options.transport ?? fetch;
      const response = await transport(
        `/api/campaigns/${encodeURIComponent(connection.campaignId)}/live?${search.toString()}`,
        {
          signal: stream.controller.signal,
          headers: { Authorization: `Bearer ${connection.token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        },
      );
      // A refused credential, perspective or request will not be accepted on a retry.
      if ([400, 401, 403].includes(response.status)) {
        refused = true;
        return;
      }
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('text/event-stream') || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new EventStreamParser();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done || !this.#current(stream)) break;
        for (const event of parser.push(decoder.decode(chunk.value, { stream: true }))) {
          const message = liveMessage(event);
          if (message) this.#receive(stream, message);
        }
        if (parser.overflowed || stream.closed !== null) break;
        // Any bytes, heartbeats included, show the stream is alive.
        this.#watch(stream, stream.ready ? this.#timing.idleMs : this.#timing.connectMs);
      }
      await reader.cancel().catch(() => undefined);
    } catch {
      // A transport failure or our own abort; `#ended` tells them apart.
    } finally {
      this.#ended(stream, refused);
    }
  }

  #receive(stream: Stream, message: LiveMessage): void {
    // A replaced or abandoned stream is a stale generation: whatever it says is ignored.
    if (!this.#current(stream)) return;
    switch (message.type) {
      case 'ready': {
        if (stream.ready) return;
        stream.ready = true;
        if (stream === this.#pending) {
          const previous = this.#active;
          this.#active = stream;
          this.#pending = null;
          this.#abandon(previous);
        }
        this.#attempt = 0;
        this.#report('live');
        this.#signal();
        return;
      }
      case 'changed':
        // Duplicates and late, out-of-order signals change nothing.
        if (!stream.ready || message.seq <= stream.lastSeq) return;
        stream.lastSeq = message.seq;
        this.#signal();
        return;
      case 'closed':
        stream.closed = message.reason;
        return;
    }
  }

  #ended(stream: Stream, refused: boolean): void {
    if (stream.watchdog !== null) clearTimeout(stream.watchdog);
    if (stream === this.#active) this.#active = null;
    else if (stream === this.#pending) this.#pending = null;
    else return;
    if (refused || (stream.closed !== null && LIVE_FINAL_REASONS.includes(stream.closed))) {
      this.close();
      this.#report('offline');
      return;
    }
    // A newer subscription is already on its way; the old one keeps serving meanwhile.
    if (this.#pending !== null) {
      if (this.#active === null) this.#report('reconnecting');
      return;
    }
    if (this.#active === null) {
      const online = this.#options.online?.() ?? true;
      this.#report(online ? 'reconnecting' : 'offline');
    }
    this.#attempt += 1;
    this.#retry = setTimeout(
      () => {
        this.#retry = null;
        this.#connect();
      },
      backoffDelay(this.#attempt, this.#options.random),
    );
  }

  #current(stream: Stream): boolean {
    return stream === this.#active || stream === this.#pending;
  }

  #watch(stream: Stream, ms: number): void {
    if (stream.watchdog !== null) clearTimeout(stream.watchdog);
    stream.watchdog = setTimeout(() => {
      stream.controller.abort();
    }, ms);
  }

  #abandon(stream: Stream | null): void {
    if (stream === null) return;
    if (stream.watchdog !== null) clearTimeout(stream.watchdog);
    stream.controller.abort();
  }

  #signal(): void {
    if (this.#coalesce !== null) return;
    this.#coalesce = setTimeout(() => {
      this.#coalesce = null;
      if (!this.#stopped) this.#options.onRefresh();
    }, this.#timing.coalesceMs);
  }

  #report(status: LiveStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#options.onStatus(status);
  }

  #clear(name: 'retry' | 'settle' | 'coalesce'): void {
    const timer =
      name === 'retry' ? this.#retry : name === 'settle' ? this.#settle : this.#coalesce;
    if (timer !== null) clearTimeout(timer);
    if (name === 'retry') this.#retry = null;
    else if (name === 'settle') this.#settle = null;
    else this.#coalesce = null;
  }
}
