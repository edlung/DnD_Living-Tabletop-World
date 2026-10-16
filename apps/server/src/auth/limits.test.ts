import { describe, expect, it } from 'vitest';

import { clientGroup } from '../platform/net/addresses.ts';
import {
  RequestLimits,
  SIGN_IN_LIMITS,
  type LimitSettings,
  type RedeemAdmission,
  type RedeemRefusal,
} from './limits.ts';

/**
 * The per-process limits (docs/adr/0036-production-sign-in.md §6, amendment 2026-10-16) on a
 * manual clock: windows slide by slices and never admit more than their limit, a lockout lasts
 * its time, every client's refusals share one budget, evidence is sampled, tables stay bounded,
 * and an in-flight slot is held until released, once. The counter itself: window-counter.test.ts.
 */
const MINUTE = 60_000;
/** One slice of a one-minute window (12 slices): an event counts at most this much longer. */
const SLICE = MINUTE / 12;

function limits(settings: Partial<LimitSettings> = {}) {
  let now = 0;
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
  return { clock, limits: new RequestLimits({ ...SIGN_IN_LIMITS, ...settings }, clock.now) };
}

const admitted = (answer: RedeemAdmission | RedeemRefusal): RedeemAdmission => {
  if (typeof answer === 'string') throw new Error(`refused: ${answer}`);
  return answer;
};

describe('redeem limits', () => {
  it('allow ten attempts per client per minute', () => {
    const { clock, limits: limit } = limits();
    const answers = Array.from({ length: 11 }, () => limit.redeemAttempt('198.51.100.1'));
    expect(answers.filter((answer) => typeof answer !== 'string')).toHaveLength(10);
    expect(answers[10]).toBe('too-fast');
    expect(typeof limit.redeemAttempt('198.51.100.2')).toBe('object');
    clock.advance(MINUTE + SLICE);
    expect(typeof limit.redeemAttempt('198.51.100.1')).toBe('object');
  });

  it('refuse a token prefix after five failures, from any client', () => {
    const { clock, limits: limit } = limits();
    for (let failure = 0; failure < 4; failure += 1) {
      admitted(limit.redeemAttempt(`198.51.100.${String(failure)}`)).failed('AbCdEfGh');
    }
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(true);
    admitted(limit.redeemAttempt('198.51.100.9')).failed('AbCdEfGh');
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(false);
    expect(limit.prefixAllowed('ZbCdEfGh')).toBe(true);
    // Fifteen minutes and one slice (of twelve) later, the failures no longer count.
    clock.advance(15 * MINUTE);
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(false);
    clock.advance((15 * MINUTE) / 12);
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(true);
  });

  it('lock a client out for fifteen minutes after twenty failures in an hour', () => {
    const { clock, limits: limit } = limits();
    for (let failure = 0; failure < 19; failure += 1) {
      admitted(limit.redeemAttempt('198.51.100.1')).failed(null);
      clock.advance(2 * MINUTE);
    }
    const twentieth = admitted(limit.redeemAttempt('198.51.100.1'));
    twentieth.failed(null);
    twentieth.failed(null); // settled once: a second report changes nothing
    expect(limit.redeemAttempt('198.51.100.1')).toBe('locked');
    clock.advance(15 * MINUTE - 1);
    expect(limit.redeemAttempt('198.51.100.1')).toBe('locked');
    clock.advance(1);
    expect(typeof limit.redeemAttempt('198.51.100.1')).toBe('object');
    expect(typeof limit.redeemAttempt('198.51.100.3')).toBe('object');
  });

  it('refuse every client once a minute’s refused redeems reach the budget, giving back sign-ins', () => {
    const { clock, limits: limit } = limits({ refusedRedeemsPerMinute: 3 });
    // A sign-in that works is no refusal: its share comes back.
    admitted(limit.redeemAttempt('198.51.100.1')).settled();
    for (let client = 2; client <= 4; client += 1) {
      admitted(limit.redeemAttempt(`198.51.100.${String(client)}`)).failed(null);
    }
    // Every client waits now, including one never seen: guessing from many addresses is bounded.
    expect(limit.redeemAttempt('198.51.100.5')).toBe('busy');
    expect(limit.redeemAttempt('203.0.113.9')).toBe('busy');
    clock.advance(MINUTE + SLICE);
    expect(typeof limit.redeemAttempt('203.0.113.9')).toBe('object');
  });

  it('count attempts still being decided against the budget, so concurrent guesses share it', () => {
    const { limits: limit } = limits({ refusedRedeemsPerMinute: 2 });
    const first = admitted(limit.redeemAttempt('198.51.100.1'));
    admitted(limit.redeemAttempt('198.51.100.2'));
    expect(limit.redeemAttempt('198.51.100.3')).toBe('busy');
    first.settled();
    expect(typeof limit.redeemAttempt('198.51.100.3')).toBe('object');
  });

  it('fail closed for a new client when the tables are full, and only for redeems', () => {
    const { clock, limits: limit } = limits({ trackedKeys: 3 });
    for (const client of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      admitted(limit.redeemAttempt(client)).failed(null);
    }
    expect(limit.redeemAttempt('198.51.100.4')).toBe('untracked');
    // Known clients go on as before; actors' requests and invitations are other tables.
    expect(typeof limit.redeemAttempt('198.51.100.1')).toBe('object');
    expect(limit.expensive('ravenford\ndm-ravenford')).not.toBeNull();
    expect(limit.invitation('ravenford\ndm-ravenford')).toBe(true);
    // Once those failures are an hour (and a slice) old, there is room again.
    clock.advance(65 * MINUTE + 1);
    expect(typeof limit.redeemAttempt('198.51.100.4')).toBe('object');
    expect(limit.tracked()).toBeLessThanOrEqual(6 * 3);
  });
});

describe('evidence of refusals', () => {
  it('is written at most once a minute per limited client, and at most the budget in all', () => {
    const { clock, limits: limit } = limits({ evidencePerMinute: 3 });
    expect([
      limit.evidence('a', 'limited'),
      limit.evidence('a', 'limited'),
      limit.evidence('b', 'limited'),
      limit.evidence('c', 'refused'),
      limit.evidence('d', 'refused'),
      limit.evidence('e', 'limited'),
    ]).toEqual([true, false, true, true, false, false]);
    // A sign-in that works is always evidence.
    expect(limit.evidence('f', 'redeemed')).toBe(true);
    clock.advance(MINUTE + SLICE);
    expect(limit.evidence('a', 'limited')).toBe(true);
  });
});

describe('expensive requests', () => {
  it('hold at most two slots per actor until released, once each', () => {
    const { limits: limit } = limits();
    const first = limit.expensive('dm');
    const second = limit.expensive('dm');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(limit.expensive('dm')).toBeNull();
    expect(limit.expensive('player')).not.toBeNull();
    first?.release();
    first?.release();
    const third = limit.expensive('dm');
    expect(third).not.toBeNull();
    expect(limit.expensive('dm')).toBeNull();
  });

  it('admit twenty per actor per minute', () => {
    const { clock, limits: limit } = limits();
    const admittedSlots = Array.from({ length: 21 }, () => {
      const slot = limit.expensive('dm');
      slot?.release();
      return slot !== null;
    });
    expect(admittedSlots.filter(Boolean)).toHaveLength(20);
    clock.advance(MINUTE);
    expect(limit.expensive('dm')).toBeNull();
    clock.advance(SLICE);
    expect(limit.expensive('dm')).not.toBeNull();
  });
});

describe('invitations', () => {
  it('allow twenty per DM per hour', () => {
    const { clock, limits: limit } = limits();
    const created = Array.from({ length: 21 }, () => limit.invitation('ravenford\ndm'));
    expect(created.filter(Boolean)).toHaveLength(20);
    expect(limit.invitation('other\ndm')).toBe(true);
    clock.advance(65 * MINUTE);
    expect(limit.invitation('ravenford\ndm')).toBe(true);
  });
});

/** A distinct IPv6 /64 per `index`, as a client rotating through a large allocation would use. */
const rotating = (index: number) =>
  clientGroup(`2001:db8:${(index >>> 16).toString(16)}:${(index & 0xffff).toString(16)}::1`);

describe('under clients rotating through addresses', () => {
  it('keeps the tables within their bound and every call cheap, even without a budget', () => {
    // No refusal budget (a misconfiguration): every address reaches the per-client tables.
    const { clock, limits: limit } = limits({
      refusedRedeemsPerMinute: Number.MAX_SAFE_INTEGER,
      evidencePerMinute: Number.MAX_SAFE_INTEGER,
      trackedKeys: 5_000,
    });
    const batches: number[] = [];
    let largest = 0;
    for (let batch = 0; batch < 12; batch += 1) {
      const started = performance.now();
      for (let call = 0; call < 10_000; call += 1) {
        const index = batch * 10_000 + call;
        clock.advance(5); // 200 attempts a second
        const client = rotating(index);
        const answer = limit.redeemAttempt(client);
        const prefix = index.toString(36).padStart(8, 'a');
        if (typeof answer !== 'string' && limit.prefixAllowed(prefix)) answer.failed(prefix);
        limit.evidence(client, typeof answer === 'string' ? 'limited' : 'refused');
      }
      batches.push(performance.now() - started);
      largest = Math.max(largest, limit.tracked());
    }
    // Six tables of at most 5,000 keys each, however many addresses came.
    expect(largest).toBeLessThanOrEqual(6 * 5_000);
    // Full tables cost no more per call than empty ones (the old sweep took seconds per batch).
    const slowest = Math.max(...batches.slice(1));
    expect(slowest, batches.map((ms) => ms.toFixed(0)).join(' ')).toBeLessThan(1_000);
  });

  it('keeps the tables small with the default budget', () => {
    const { clock, limits: limit } = limits();
    let largest = 0;
    for (let index = 0; index < 50_000; index += 1) {
      clock.advance(5);
      const answer = limit.redeemAttempt(rotating(index));
      if (typeof answer !== 'string') answer.failed(index.toString(36).padStart(8, 'a'));
      largest = Math.max(largest, limit.tracked());
    }
    // About four minutes of attempts: at most sixty refusals a minute reach each client table.
    expect(largest).toBeLessThanOrEqual(3 * 60 * 5);
  });
});
