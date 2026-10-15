import { describe, expect, it } from 'vitest';

import { DAY_TWO_MORNING, formatWorldTime, nextMorning } from './world-time.ts';

describe('formatWorldTime', () => {
  it('reads Day 1 10:00 and Day 2 10:00', () => {
    expect(formatWorldTime(36_000)).toBe('Day 1 · 10:00');
    expect(formatWorldTime(DAY_TWO_MORNING)).toBe('Day 2 · 10:00');
  });
  it('describes time before the story as days earlier', () => {
    expect(formatWorldTime(-17_366_400)).toBe('201 days before Day 1');
  });
  it('pads minutes and starts at Day 1', () => {
    expect(formatWorldTime(0)).toBe('Day 1 · 00:00');
    expect(formatWorldTime(86_400 + 3_660)).toBe('Day 2 · 01:01');
  });
});

describe('nextMorning', () => {
  it('offers the next day’s morning on Day 1, Day 2 and Day 3', () => {
    expect(nextMorning(36_000)).toEqual({ day: 2, at: DAY_TWO_MORNING });
    expect(formatWorldTime(nextMorning(36_000).at)).toBe('Day 2 · 10:00');
    expect(nextMorning(DAY_TWO_MORNING)).toEqual({ day: 3, at: 2 * 86_400 + 36_000 });
    expect(formatWorldTime(nextMorning(DAY_TWO_MORNING).at)).toBe('Day 3 · 10:00');
    expect(nextMorning(2 * 86_400 + 50_000)).toEqual({ day: 4, at: 3 * 86_400 + 36_000 });
  });

  it('never offers a day already reached, at any hour of it', () => {
    for (const seconds of [0, 1, 35_999, 36_000, 36_001, 86_399, 86_400, 122_399, 172_799]) {
      const { day, at } = nextMorning(seconds);
      expect(at, String(seconds)).toBeGreaterThan(seconds);
      expect(day, String(seconds)).toBe(Math.floor(seconds / 86_400) + 2);
      expect(formatWorldTime(at)).toBe(`Day ${String(day)} · 10:00`);
    }
  });

  it('offers Day 1 morning to a world that starts before the story', () => {
    expect(nextMorning(-3_600)).toEqual({ day: 1, at: 36_000 });
  });
});
