import { describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { ManualTimers } from '../testing/live.ts';
import type { SubscriptionKey, Verdict } from './fingerprint.ts';
import { LIVE_LIMITS, LiveHub, type LiveLimits } from './hub.ts';
import { LiveRegistry } from './registry.ts';
import { HEARTBEAT, type LiveSink } from './stream.ts';

/**
 * The comparison loop and stream bounds (docs/STAGE_310_DESIGN.md §A: cadence, recheck,
 * bounds), with fingerprints and connections faked: one loop, no overlapping cycles, the
 * baseline before `ready`, caps, a slow consumer dropped, failures closing without a signal,
 * and shutdown.
 */
class FakeSink implements LiveSink {
  readonly written: string[] = [];
  backlog = 0;
  ended = false;
  destroyed = false;
  readonly #listeners: (() => void)[] = [];
  write(text: string): void {
    this.written.push(text);
  }
  unsent(): number {
    return this.backlog;
  }
  end(): void {
    this.ended = true;
    this.close();
  }
  destroy(): void {
    this.destroyed = true;
    this.close();
  }
  onClose(listener: () => void): void {
    this.#listeners.push(listener);
  }
  /** The connection closes (client disconnect). */
  close(): void {
    for (const listener of this.#listeners.splice(0)) listener();
  }
  messages(): string[] {
    return this.written.filter((text) => text !== HEARTBEAT);
  }
}

interface Deferred {
  readonly promise: Promise<Verdict>;
  resolve(verdict: Verdict): void;
}

function deferred(): Deferred {
  let resolve: (verdict: Verdict) => void = () => undefined;
  const promise = new Promise<Verdict>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const print = (value: string): Verdict => ({ kind: 'fingerprint', value });

function hubWith(
  fingerprint: (subscription: SubscriptionKey) => Promise<Verdict>,
  limits: Partial<LiveLimits> = {},
) {
  const timers = new ManualTimers();
  const all = { ...LIVE_LIMITS, ...limits };
  const registry = new LiveRegistry({
    now: timers.now,
    graceMs: all.graceMs,
    perActor: all.perActor,
    perProcess: all.perProcess,
  });
  const hub = new LiveHub({
    registry,
    fingerprint,
    timers,
    limits: all,
    logger: createLogger({ service: 'hub-test', level: 'silent' }),
  });
  return { hub, timers, registry };
}

const key = (actorId = 'player-elowen', campaignId = 'ravenford') => ({
  target: {
    campaignId,
    perspective: 'PLAYER',
    kind: 'CHARACTER' as const,
    focus: null,
    place: null,
    identity: true,
  },
  authorization: 'Bearer test',
  actorId,
});

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('the live hub', () => {
  it('takes the baseline before ready and signals each observed change once', async () => {
    let value = 'a';
    const calls: string[] = [];
    const { hub } = hubWith((subscription) => {
      calls.push(subscription.actorId);
      return Promise.resolve(print(value));
    });
    const sink = new FakeSink();
    const opened = hub.open({ ...key(), sink });
    expect(sink.messages()).toEqual([]);
    await opened;
    expect(calls).toHaveLength(1);
    expect(sink.messages()).toEqual(['event: ready\ndata: {}\n\n']);
    await hub.cycle();
    expect(sink.messages()).toHaveLength(1);
    value = 'b';
    await hub.cycle();
    await hub.cycle();
    expect(sink.messages().slice(1)).toEqual(['event: changed\ndata: {"seq":1}\n\n']);
  });

  it('never overlaps cycles: a call during a cycle joins it, and each stream is compared once', async () => {
    let gate: Deferred | null = null;
    let compared = 0;
    const { hub, timers } = hubWith(() => {
      compared += 1;
      return gate ? gate.promise : Promise.resolve(print('a'));
    });
    const sink = new FakeSink();
    await hub.open({ ...key(), sink });
    compared = 0;
    gate = deferred();
    const first = hub.cycle();
    const second = hub.cycle();
    expect(second).toBe(first);
    // The timer firing during a running cycle schedules nothing until the cycle ends.
    timers.advance(5_000);
    expect(compared).toBe(1);
    expect(timers.pending().filter((delay) => delay <= LIVE_LIMITS.cycleMs)).toEqual([]);
    gate.resolve(print('b'));
    await first;
    expect(compared).toBe(1);
    expect(sink.messages().at(-1)).toBe('event: changed\ndata: {"seq":1}\n\n');
    // The next cycle is armed only now, at most one period away.
    expect(timers.pending()).toContain(0);
  });

  it('runs one cycle per period while subscribed, and stops when the last stream closes', async () => {
    let compared = 0;
    const { hub, timers } = hubWith(() => {
      compared += 1;
      return Promise.resolve(print('a'));
    });
    const sink = new FakeSink();
    await hub.open({ ...key(), sink });
    compared = 0;
    for (let period = 0; period < 3; period += 1) {
      timers.advance(LIVE_LIMITS.cycleMs);
      await settle();
    }
    expect(compared).toBe(3);
    sink.close();
    expect(hub.size).toBe(0);
    expect(timers.pending()).toEqual([]);
    timers.advance(10 * LIVE_LIMITS.cycleMs);
    expect(compared).toBe(3);
  });

  it('closes on a verdict or a failure and never turns either into a signal', async () => {
    const verdicts: (Verdict | Error)[] = [];
    const { hub } = hubWith(() => {
      const next = verdicts.shift() ?? print('a');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    });
    for (const [outcome, reason] of [
      [{ kind: 'close', reason: 'unauthenticated' }, 'unauthenticated'],
      [{ kind: 'close', reason: 'forbidden' }, 'forbidden'],
      [{ kind: 'close', reason: 'gone' }, 'gone'],
      [new Error('projection failed'), 'gone'],
    ] as const) {
      const sink = new FakeSink();
      await hub.open({ ...key(), sink });
      verdicts.push(outcome);
      await hub.cycle();
      expect(sink.messages()).toEqual([
        'event: ready\ndata: {}\n\n',
        `event: closed\ndata: {"reason":"${reason}"}\n\n`,
      ]);
      expect(sink.ended).toBe(true);
    }
    expect(hub.size).toBe(0);
  });

  it('refuses a failing baseline before ready', async () => {
    const { hub } = hubWith(() => Promise.resolve({ kind: 'close', reason: 'forbidden' }));
    const sink = new FakeSink();
    await hub.open({ ...key(), sink });
    expect(sink.messages()).toEqual(['event: closed\ndata: {"reason":"forbidden"}\n\n']);
    expect(hub.size).toBe(0);
  });

  it('allows 4 streams per actor per campaign and 200 per process', async () => {
    const { hub } = hubWith(() => Promise.resolve(print('a')), { perProcess: 6 });
    const sinks: FakeSink[] = [];
    const open = async (actorId: string, campaignId = 'ravenford') => {
      const sink = new FakeSink();
      sinks.push(sink);
      await hub.open({ ...key(actorId, campaignId), sink });
      return sink;
    };
    for (let tab = 0; tab < 4; tab += 1) await open('player-elowen');
    const fifth = await open('player-elowen');
    expect(fifth.messages()).toEqual(['event: closed\ndata: {"reason":"overloaded"}\n\n']);
    expect(fifth.ended).toBe(true);
    // Another campaign and another actor have caps of their own, up to the process limit.
    expect((await open('player-elowen', 'elsewhere')).messages()).toEqual([
      'event: ready\ndata: {}\n\n',
    ]);
    expect((await open('dm-ravenford')).messages()).toEqual(['event: ready\ndata: {}\n\n']);
    expect((await open('dm-ravenford')).messages()).toEqual([
      'event: closed\ndata: {"reason":"overloaded"}\n\n',
    ]);
    expect(hub.size).toBe(6);
    // A closed stream frees its place.
    sinks[0]?.close();
    expect((await open('dm-ravenford')).messages()).toEqual(['event: ready\ndata: {}\n\n']);
    expect(LIVE_LIMITS).toMatchObject({ perActor: 4, perProcess: 200 });
  });

  it('drops a consumer whose unsent backlog exceeds 64 KiB', async () => {
    let value = 0;
    const { hub, timers } = hubWith(() => Promise.resolve(print(String(value))));
    const slow = new FakeSink();
    const fast = new FakeSink();
    await hub.open({ ...key('player-elowen'), sink: slow });
    await hub.open({ ...key('dm-ravenford'), sink: fast });
    slow.backlog = 64 * 1024;
    value += 1;
    await hub.cycle();
    expect(slow.destroyed).toBe(false);
    slow.backlog = 64 * 1024 + 1;
    timers.advance(LIVE_LIMITS.heartbeatMs);
    expect(slow.destroyed).toBe(true);
    expect(fast.destroyed).toBe(false);
    expect(fast.written.at(-1)).toBe(HEARTBEAT);
    expect(hub.size).toBe(1);
  });

  it('sends a comment heartbeat every 15 s, independent of changes', async () => {
    const { hub, timers } = hubWith(() => Promise.resolve(print('a')));
    const sink = new FakeSink();
    await hub.open({ ...key(), sink });
    timers.advance(LIVE_LIMITS.heartbeatMs - 1);
    await settle();
    expect(sink.written.filter((text) => text === HEARTBEAT)).toHaveLength(0);
    timers.advance(1);
    timers.advance(LIVE_LIMITS.heartbeatMs);
    await settle();
    expect(sink.written.filter((text) => text === HEARTBEAT)).toHaveLength(2);
    expect(sink.messages()).toEqual(['event: ready\ndata: {}\n\n']);
  });

  it('closes every stream with shutdown, lets a running cycle end, and refuses new ones', async () => {
    let gate: Deferred | null = null;
    const { hub, timers } = hubWith(() => (gate ? gate.promise : Promise.resolve(print('a'))));
    const sinks = [new FakeSink(), new FakeSink()];
    for (const sink of sinks) await hub.open({ ...key(), sink });
    gate = deferred();
    const running = hub.cycle();
    const closing = hub.shutdown();
    gate.resolve(print('b'));
    await Promise.all([running, closing]);
    for (const sink of sinks) {
      expect(sink.messages()).toEqual([
        'event: ready\ndata: {}\n\n',
        'event: closed\ndata: {"reason":"shutdown"}\n\n',
      ]);
    }
    expect(hub.size).toBe(0);
    expect(timers.pending()).toEqual([]);
    const late = new FakeSink();
    await hub.open({ ...key(), sink: late });
    expect(late.messages()).toEqual(['event: closed\ndata: {"reason":"shutdown"}\n\n']);
  });

  it('forgets a stream whose consumer left while its baseline was taken', async () => {
    const gate = deferred();
    const { hub, registry } = hubWith(() => gate.promise);
    const sink = new FakeSink();
    const opened = hub.open({ ...key(), sink });
    sink.close();
    gate.resolve(print('a'));
    await opened;
    expect(sink.messages()).toEqual([]);
    expect(hub.size).toBe(0);
    expect(registry.size).toBe(0);
  });
});
