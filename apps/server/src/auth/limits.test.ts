import { describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS, SlidingWindow } from './limits.ts';

/**
 * The per-process limits (docs/adr/0036-production-sign-in.md §6) on a manual clock: windows
 * slide, a lockout lasts its time, and an in-flight slot is held until released, once.
 */
const MINUTE = 60_000;

function limits() {
  let now = 0;
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
  return { clock, limits: new RequestLimits(SIGN_IN_LIMITS, clock.now) };
}

describe('a sliding window', () => {
  it('admits up to its limit within the window and again as events age out', () => {
    const window = new SlidingWindow(2, MINUTE);
    expect([window.take('a', 0), window.take('a', 10), window.take('a', 20)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(window.take('b', 20)).toBe(true);
    expect(window.take('a', MINUTE)).toBe(true);
    expect(window.count('a', MINUTE)).toBe(2);
    expect(window.count('a', 3 * MINUTE)).toBe(0);
  });

  it('records failures past the limit without growing beyond it', () => {
    const window = new SlidingWindow(3, MINUTE);
    for (let at = 0; at < 10; at += 1) window.add('a', at);
    expect(window.count('a', 10)).toBe(3);
  });
});

describe('redeem limits', () => {
  it('allow ten attempts per address per minute', () => {
    const { clock, limits: limit } = limits();
    const answers = Array.from({ length: 11 }, () => limit.redeemAttempt('198.51.100.1'));
    expect(answers.filter(Boolean)).toHaveLength(10);
    expect(limit.redeemAttempt('198.51.100.2')).toBe(true);
    clock.advance(MINUTE);
    expect(limit.redeemAttempt('198.51.100.1')).toBe(true);
  });

  it('refuse a token prefix after five failures', () => {
    const { clock, limits: limit } = limits();
    for (let failure = 0; failure < 4; failure += 1)
      limit.redeemFailed(`ip-${String(failure)}`, 'AbCdEfGh');
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(true);
    limit.redeemFailed('ip-9', 'AbCdEfGh');
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(false);
    expect(limit.prefixAllowed('ZbCdEfGh')).toBe(true);
    clock.advance(15 * MINUTE);
    expect(limit.prefixAllowed('AbCdEfGh')).toBe(true);
  });

  it('lock an address out for fifteen minutes after twenty failures in an hour', () => {
    const { clock, limits: limit } = limits();
    for (let failure = 0; failure < 19; failure += 1) {
      limit.redeemFailed('198.51.100.1', null);
      clock.advance(2 * MINUTE);
    }
    expect(limit.redeemAttempt('198.51.100.1')).toBe(true);
    limit.redeemFailed('198.51.100.1', null);
    expect(limit.redeemAttempt('198.51.100.1')).toBe(false);
    clock.advance(15 * MINUTE - 1);
    expect(limit.redeemAttempt('198.51.100.1')).toBe(false);
    clock.advance(1);
    expect(limit.redeemAttempt('198.51.100.1')).toBe(true);
    expect(limit.redeemAttempt('198.51.100.3')).toBe(true);
  });
});

describe('evidence of refusals', () => {
  it('is written at most once a minute per address', () => {
    const { clock, limits: limit } = limits();
    expect([
      limit.limitedEvidence('a'),
      limit.limitedEvidence('a'),
      limit.limitedEvidence('b'),
    ]).toEqual([true, false, true]);
    clock.advance(MINUTE);
    expect(limit.limitedEvidence('a')).toBe(true);
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
    const admitted = Array.from({ length: 21 }, () => {
      const slot = limit.expensive('dm');
      slot?.release();
      return slot !== null;
    });
    expect(admitted.filter(Boolean)).toHaveLength(20);
    clock.advance(MINUTE);
    expect(limit.expensive('dm')).not.toBeNull();
  });
});

describe('invitations', () => {
  it('allow twenty per DM per hour', () => {
    const { clock, limits: limit } = limits();
    const created = Array.from({ length: 21 }, () => limit.invitation('ravenford\ndm'));
    expect(created.filter(Boolean)).toHaveLength(20);
    expect(limit.invitation('other\ndm')).toBe(true);
    clock.advance(60 * MINUTE);
    expect(limit.invitation('ravenford\ndm')).toBe(true);
  });
});
