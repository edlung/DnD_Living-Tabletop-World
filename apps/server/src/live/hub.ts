import type { LiveCloseReason } from '@ltw/contracts';

import type { Logger } from '../platform/logging/logger.ts';
import type { SubscriptionKey, Verdict } from './fingerprint.ts';
import type { LiveRegistry, LiveTicket } from './registry.ts';
import { frame, HEARTBEAT, type LiveSink } from './stream.ts';

/**
 * Live subscriptions and their comparison loop (docs/adr/0033-live-session.md §1–3). One loop
 * per process compares every ready subscription at most once per cycle; cycles never overlap,
 * and the next is armed only after the previous one finished. Signals of a cycle are written
 * when the whole cycle is computed, so their timing is the cycle's, not a commit's. A
 * subscription's baseline is taken before `ready`; a verdict to close ends it, and no error
 * ever produces `changed`.
 */
export interface LiveLimits {
  readonly cycleMs: number;
  readonly heartbeatMs: number;
  /** Subscriptions per actor per campaign. */
  readonly perActor: number;
  readonly perProcess: number;
  /** A consumer whose unsent backlog exceeds this many bytes is dropped. */
  readonly bufferBytes: number;
  /** Presence grace after an actor's last subscription closes. */
  readonly graceMs: number;
  /** Subscriptions fingerprinted at once within a cycle. */
  readonly concurrency: number;
}

export const LIVE_LIMITS: LiveLimits = {
  cycleMs: 1_000,
  heartbeatMs: 15_000,
  perActor: 4,
  perProcess: 200,
  bufferBytes: 64 * 1024,
  graceMs: 10_000,
  concurrency: 8,
};

export interface LiveTimers {
  now(): number;
  /** Runs `run` once after `ms`; returns its cancellation. */
  after(ms: number, run: () => void): () => void;
}

export const systemTimers: LiveTimers = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    // Live timers never keep a process alive on their own.
    timer.unref();
    return () => {
      clearTimeout(timer);
    };
  },
};

export interface LiveHubOptions {
  readonly registry: LiveRegistry;
  readonly fingerprint: (subscription: SubscriptionKey) => Promise<Verdict>;
  readonly timers: LiveTimers;
  readonly limits: LiveLimits;
  readonly logger: Logger;
}

export interface LiveOpenRequest extends SubscriptionKey {
  readonly sink: LiveSink;
}

interface Subscription extends LiveOpenRequest {
  readonly ticket: LiveTicket;
  state: 'baseline' | 'ready' | 'closed';
  fingerprint: string;
  seq: number;
}

/** Read through a call: a write may have dropped the subscription since the last check. */
const dropped = (subscription: Subscription): boolean => subscription.state === 'closed';

export class LiveHub {
  readonly #options: LiveHubOptions;
  readonly #subscriptions = new Set<Subscription>();
  #running: Promise<void> | null = null;
  #cycleTimer: (() => void) | null = null;
  #heartbeatTimer: (() => void) | null = null;
  #lastCycle = Number.NEGATIVE_INFINITY;
  #closed = false;

  constructor(options: LiveHubOptions) {
    this.#options = options;
  }

  /** Open subscriptions, including those whose baseline is being taken. */
  get size(): number {
    return this.#subscriptions.size;
  }

  /** Registers a subscription on an opened stream, takes its baseline, then sends `ready`. */
  async open(request: LiveOpenRequest): Promise<void> {
    const ticket = this.#closed
      ? null
      : this.#options.registry.admit(request.target.campaignId, request.actorId);
    if (!ticket) {
      request.sink.write(
        frame({ type: 'closed', reason: this.#closed ? 'shutdown' : 'overloaded' }),
      );
      request.sink.end();
      return;
    }
    const subscription: Subscription = {
      ...request,
      ticket,
      state: 'baseline',
      fingerprint: '',
      seq: 0,
    };
    // A loop that was idle starts its cycles from now.
    if (this.#subscriptions.size === 0 && this.#running === null) {
      this.#lastCycle = this.#options.timers.now();
    }
    this.#subscriptions.add(subscription);
    request.sink.onClose(() => {
      this.#drop(subscription);
    });
    this.#arm();
    const verdict = await this.#check(subscription);
    // The consumer may have left, or the process begun shutting down, meanwhile.
    if (subscription.state !== 'baseline') return;
    if (verdict.kind === 'close') {
      this.#close(subscription, verdict.reason);
      return;
    }
    subscription.fingerprint = verdict.value;
    subscription.state = 'ready';
    this.#write(subscription, frame({ type: 'ready' }));
  }

  /** One comparison of every ready subscription; a call during a cycle joins that cycle. */
  cycle(): Promise<void> {
    this.#running ??= this.#compare().finally(() => {
      this.#running = null;
      this.#arm();
    });
    return this.#running;
  }

  /** Ends every stream with `shutdown` and refuses new ones. */
  async shutdown(): Promise<void> {
    this.#closed = true;
    this.#disarm();
    for (const subscription of [...this.#subscriptions]) this.#close(subscription, 'shutdown');
    await this.#running;
  }

  async #compare(): Promise<void> {
    this.#lastCycle = this.#options.timers.now();
    const batch = [...this.#subscriptions].filter((subscription) => subscription.state === 'ready');
    const verdicts: Verdict[] = [];
    for (let start = 0; start < batch.length; start += this.#options.limits.concurrency) {
      const chunk = batch.slice(start, start + this.#options.limits.concurrency);
      verdicts.push(...(await Promise.all(chunk.map((subscription) => this.#check(subscription)))));
    }
    for (const [index, subscription] of batch.entries()) {
      const verdict = verdicts[index];
      if (subscription.state !== 'ready' || !verdict) continue;
      if (verdict.kind === 'close') {
        this.#close(subscription, verdict.reason);
      } else if (verdict.value !== subscription.fingerprint) {
        subscription.fingerprint = verdict.value;
        subscription.seq += 1;
        this.#write(subscription, frame({ type: 'changed', seq: subscription.seq }));
      }
    }
  }

  async #check(subscription: Subscription): Promise<Verdict> {
    try {
      return await this.#options.fingerprint(subscription);
    } catch (error) {
      // A failed computation closes the stream; it never signals and never continues unchecked.
      this.#options.logger.warn(
        { err: error instanceof Error ? error.name : 'unknown' },
        'live fingerprint failed',
      );
      return { kind: 'close', reason: 'gone' };
    }
  }

  #write(subscription: Subscription, text: string): void {
    if (subscription.state === 'closed') return;
    subscription.sink.write(text);
    if (subscription.sink.unsent() > this.#options.limits.bufferBytes) {
      subscription.sink.destroy();
      this.#drop(subscription);
    }
  }

  #close(subscription: Subscription, reason: LiveCloseReason): void {
    if (subscription.state === 'closed') return;
    this.#write(subscription, frame({ type: 'closed', reason }));
    // A slow consumer was already dropped by that write.
    if (dropped(subscription)) return;
    subscription.sink.end();
    this.#drop(subscription);
  }

  #drop(subscription: Subscription): void {
    if (subscription.state === 'closed') return;
    subscription.state = 'closed';
    this.#subscriptions.delete(subscription);
    this.#options.registry.release(subscription.ticket);
    if (this.#subscriptions.size === 0) this.#disarm();
  }

  /** Keeps a cycle and a heartbeat scheduled while any subscription is open. */
  #arm(): void {
    if (this.#closed || this.#subscriptions.size === 0) return;
    const { timers, limits } = this.#options;
    if (this.#cycleTimer === null && this.#running === null) {
      // Cycles start a period apart; one that ran long is followed at once, never overlapped.
      const due = this.#lastCycle + limits.cycleMs - timers.now();
      this.#cycleTimer = timers.after(Math.min(Math.max(0, due), limits.cycleMs), () => {
        this.#cycleTimer = null;
        void this.cycle();
      });
    }
    this.#heartbeatTimer ??= timers.after(limits.heartbeatMs, () => {
      this.#heartbeatTimer = null;
      for (const subscription of [...this.#subscriptions]) this.#write(subscription, HEARTBEAT);
      this.#arm();
    });
  }

  #disarm(): void {
    this.#cycleTimer?.();
    this.#cycleTimer = null;
    this.#heartbeatTimer?.();
    this.#heartbeatTimer = null;
  }
}
