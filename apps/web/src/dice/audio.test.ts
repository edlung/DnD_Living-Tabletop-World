import { describe, expect, it } from 'vitest';

import { impact } from './audio.ts';

const rms = (samples: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += (samples[i] ?? 0) ** 2;
  return Math.sqrt(sum / Math.max(1, to - from));
};

describe('the synthesized dice impacts', () => {
  for (const kind of ['table', 'die'] as const) {
    it(`makes a ${kind} impact that starts softly, peaks below full scale and dies away`, () => {
      const rate = 48_000;
      const samples = impact(rate, kind, 101);
      expect(samples.every(Number.isFinite)).toBe(true);
      const peak = samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
      expect(peak).toBeCloseTo(0.9, 5);
      // No click at the very start: the first sample is silent.
      expect(Math.abs(samples[0] ?? 1)).toBeLessThan(0.01);
      // Loud in its first 10 ms, nearly silent in its last 10 ms.
      const head = rms(samples, 0, rate / 100);
      const tail = rms(samples, samples.length - rate / 100, samples.length);
      expect(tail).toBeLessThan(head / 30);
    });
  }

  it('sounds alike for the same seed and differs between seeds', () => {
    expect(impact(44_100, 'table', 7)).toEqual(impact(44_100, 'table', 7));
    expect(impact(44_100, 'table', 7)).not.toEqual(impact(44_100, 'table', 8));
  });
});
