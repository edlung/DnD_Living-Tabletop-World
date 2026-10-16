import { describe, expect, it } from 'vitest';

import { WindowCounter } from './window-counter.ts';

/**
 * The bounded, time-bucketed counter behind every request limit
 * (docs/adr/0036-production-sign-in.md, amendment 2026-10-16).
 */
const MINUTE = 60_000;
const SLICE = MINUTE / 12;

/** A small deterministic generator, so the property below always sees the same times. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('a window counter', () => {
  it('admits up to its limit, and again once the window and one slice have passed', () => {
    const counter = new WindowCounter({ limit: 2, windowMs: MINUTE, maxKeys: 10 });
    expect([counter.take('a', 0), counter.take('a', 10), counter.take('a', 20)]).toEqual([
      'taken',
      'taken',
      'limited',
    ]);
    expect(counter.take('b', 20)).toBe('taken');
    // Counted for at least the whole window, at most one slice longer.
    expect(counter.take('a', MINUTE)).toBe('limited');
    expect(counter.take('a', MINUTE + SLICE)).toBe('taken');
    expect(counter.count('a', MINUTE + SLICE)).toBe(1);
    expect(counter.count('a', 3 * MINUTE)).toBe(0);
    expect(counter.latest('a')).toBe(MINUTE + SLICE);
  });

  it('records failures past its limit', () => {
    const counter = new WindowCounter({ limit: 3, windowMs: MINUTE, maxKeys: 10 });
    const counts = Array.from({ length: 5 }, (_, at) => counter.add('a', at));
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    expect(counter.count('a', 10)).toBe(5);
  });

  it('is never more permissive than its limit over any window', () => {
    const next = random(340);
    const counter = new WindowCounter({ limit: 3, windowMs: 1_000, maxKeys: 1 });
    const admitted: number[] = [];
    let now = 0;
    for (let request = 0; request < 5_000; request += 1) {
      now += Math.floor(next() * 120);
      if (counter.take('k', now) === 'taken') admitted.push(now);
    }
    expect(admitted.length).toBeGreaterThan(500);
    let first = 0;
    for (let last = 0; last < admitted.length; last += 1) {
      while ((admitted[first] ?? 0) < (admitted[last] ?? 0) - 1_000) first += 1;
      expect(last - first + 1).toBeLessThanOrEqual(3);
    }
  });

  it('tracks at most its keys, and takes a new one only when an old one has expired', () => {
    const counter = new WindowCounter({ limit: 5, windowMs: MINUTE, maxKeys: 3 });
    for (const key of ['a', 'b', 'c']) expect(counter.take(key, 0)).toBe('taken');
    expect(counter.take('d', 1_000)).toBe('untracked');
    expect(counter.add('d', 1_000)).toBeNull();
    expect(counter.accepts('d', 1_000)).toBe(false);
    expect(counter.accepts('a', 1_000)).toBe(true);
    expect(counter.take('a', MINUTE / 2)).toBe('taken');
    expect(counter.size).toBe(3);
    // `b` and `c` expire first (their latest events are oldest); `a` is still counted.
    expect(counter.take('d', MINUTE + SLICE)).toBe('taken');
    expect(counter.count('a', MINUTE + SLICE)).toBe(1);
    expect(counter.size).toBeLessThanOrEqual(3);
  });

  it('gives back a refunded event while its slice is counted, never below zero', () => {
    const counter = new WindowCounter({ limit: 2, windowMs: MINUTE, maxKeys: 10 });
    counter.take('k', 0);
    counter.take('k', 1);
    expect(counter.take('k', 2)).toBe('limited');
    counter.untake('k', 1);
    expect(counter.take('k', 3)).toBe('taken');
    // A refund of a slice no longer counted, or of an unknown key, changes nothing.
    counter.untake('k', -10 * MINUTE);
    counter.untake('other', 0);
    expect(counter.count('k', 4)).toBe(2);
    counter.untake('k', 0);
    counter.untake('k', 0);
    counter.untake('k', 0);
    expect(counter.count('k', 4)).toBe(0);
  });

  it('keeps counting through a clock that steps back', () => {
    const counter = new WindowCounter({ limit: 2, windowMs: MINUTE, maxKeys: 10 });
    expect(counter.take('k', 10 * MINUTE)).toBe('taken');
    expect(counter.take('k', 9 * MINUTE)).toBe('taken');
    expect(counter.take('k', 9 * MINUTE)).toBe('limited');
    expect(counter.count('k', 10 * MINUTE)).toBe(2);
  });
});
