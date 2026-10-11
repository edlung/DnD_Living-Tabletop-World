import { describe, expect, it } from 'vitest';

import {
  PricingError,
  chargeFor,
  formatDollars,
  positiveMicros,
  reservationMicros,
  settlementMicros,
  tokens,
  type PricingVersion,
} from './money.ts';

const perMillion = (dollars: number) => ({
  micros: BigInt(Math.round(dollars * 1_000_000)),
  perTokens: 1_000_000n,
});

/** A two-tier price: long context (from 200k input tokens) costs double. */
const PRICING: PricingVersion = {
  version: 'test-2026-10-11',
  tiers: [
    {
      fromInputTokens: 0,
      rates: {
        uncachedInput: perMillion(3),
        cacheRead: perMillion(0.3),
        cacheWrite5m: perMillion(3.75),
        cacheWrite1h: perMillion(6),
        output: perMillion(15),
      },
    },
    {
      fromInputTokens: 200_000,
      rates: {
        uncachedInput: perMillion(6),
        cacheRead: perMillion(0.6),
        cacheWrite5m: perMillion(7.5),
        cacheWrite1h: perMillion(12),
        output: perMillion(22.5),
      },
    },
  ],
};

describe('integer microdollar arithmetic', () => {
  it('rounds up once per dimension, never per token', () => {
    // 1 token at $3/MTok is 3 micro-dollars exactly; 1 token at $0.3/MTok is 0.3 -> 1.
    expect(chargeFor(1n, perMillion(3))).toBe(3n);
    expect(chargeFor(1n, perMillion(0.3))).toBe(1n);
    // 10 tokens at $0.3/MTok: 3 micro-dollars once, not 10 × ceil(0.3) = 10.
    expect(chargeFor(10n, perMillion(0.3))).toBe(3n);
    expect(chargeFor(0n, perMillion(15))).toBe(0n);
  });

  it('sums independently rounded dimensions, exactly, with no floating point', () => {
    expect(settlementMicros(PRICING, { uncachedInput: 1, output: 1 })).toBe(3n + 15n);
    expect(settlementMicros(PRICING, { uncachedInput: 333_333, output: 7 })).toBe(
      chargeFor(333_333n, perMillion(6)) + chargeFor(7n, perMillion(22.5)),
    );
    expect(formatDollars(1_234_567n)).toBe('$1.234567');
  });

  it('settles at the tier the actual input reaches, across the boundary', () => {
    const below = settlementMicros(PRICING, { uncachedInput: 199_999, output: 1_000 });
    const at = settlementMicros(PRICING, {
      uncachedInput: 199_000,
      cacheRead: 1_000,
      output: 1_000,
    });
    expect(below).toBe(chargeFor(199_999n, perMillion(3)) + chargeFor(1_000n, perMillion(15)));
    expect(at).toBe(
      chargeFor(199_000n, perMillion(6)) +
        chargeFor(1_000n, perMillion(0.6)) +
        chargeFor(1_000n, perMillion(22.5)),
    );
  });

  it('reserves every dimension at its highest rate, including 1-hour cache writes', () => {
    const bound = { uncachedInput: 1_000, cacheWrite1h: 1_000, output: 1_000 };
    expect(reservationMicros(PRICING, bound)).toBe(6_000n + 12_000n + 22_500n);
    expect(reservationMicros(PRICING, bound)).toBeGreaterThanOrEqual(
      settlementMicros(PRICING, bound),
    );
  });

  it('refuses unpriced dimensions and invalid token counts', () => {
    const narrow: PricingVersion = { version: 'n', tiers: [{ fromInputTokens: 0, rates: {} }] };
    expect(() => settlementMicros(narrow, { output: 1 })).toThrow(PricingError);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60, '3']) {
      expect(() => tokens(bad)).toThrow(PricingError);
    }
  });

  it('parses only positive integer microdollars', () => {
    expect(positiveMicros('5000000')).toBe(5_000_000n);
    for (const bad of ['0', '-1', '1.5', '1e6', ' 1', '', '99999999999999999999']) {
      expect(() => positiveMicros(bad)).toThrow(PricingError);
    }
  });
});
