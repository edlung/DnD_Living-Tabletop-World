import { describe, expect, it } from 'vitest';

import { DAY_TWO_MORNING, formatWorldTime } from './world-time.ts';

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
