/**
 * Integer microdollar arithmetic (docs/adr/0032-live-ai.md, amendment 2026-10-11). Money never
 * passes through binary floating point: rates are rationals of microdollars per token count, a
 * charge is `ceil(tokens × rate)` once per billing dimension per attempt, and dimensions are summed.
 */

/** A price: `micros` microdollars for every `perTokens` tokens (for example 4_000_000 per 1_000_000). */
export interface Rate {
  readonly micros: bigint;
  readonly perTokens: bigint;
}

/**
 * Billing dimensions an attempt may be charged for. Reasoning tokens bill as output. Dimensions a
 * pricing version does not list are not accepted: usage in them cannot be priced.
 */
export const BILLING_DIMENSIONS = [
  'uncachedInput',
  'cacheRead',
  'cacheWrite5m',
  'cacheWrite1h',
  'output',
] as const;
export type BillingDimension = (typeof BILLING_DIMENSIONS)[number];

export type TokenCounts = Partial<Readonly<Record<BillingDimension, number>>>;

/**
 * A versioned pricing function. Tiers are ordered by `fromInputTokens` (the first is 0); the tier
 * applying to an attempt is the last whose threshold its total input tokens reach.
 */
export interface PricingVersion {
  readonly version: string;
  readonly tiers: readonly {
    readonly fromInputTokens: number;
    readonly rates: Partial<Readonly<Record<BillingDimension, Rate>>>;
  }[];
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/** Accepts only a nonnegative safe integer token count. */
export function tokens(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PricingError('token count must be a nonnegative safe integer');
  }
  return BigInt(value);
}

/** `ceil(count × rate)` in microdollars, for one dimension. */
export function chargeFor(count: bigint, rate: Rate): bigint {
  if (count < 0n || rate.micros < 0n || rate.perTokens <= 0n) {
    throw new PricingError('invalid charge operands');
  }
  const product = count * rate.micros;
  return (product + rate.perTokens - 1n) / rate.perTokens;
}

const inputTokens = (counts: TokenCounts): bigint =>
  tokens(counts.uncachedInput ?? 0) +
  tokens(counts.cacheRead ?? 0) +
  tokens(counts.cacheWrite5m ?? 0) +
  tokens(counts.cacheWrite1h ?? 0);

function priced(
  counts: TokenCounts,
  rateOf: (dimension: BillingDimension) => Rate | undefined,
): bigint {
  let total = 0n;
  for (const dimension of BILLING_DIMENSIONS) {
    const count = tokens(counts[dimension] ?? 0);
    if (count === 0n) continue;
    const rate = rateOf(dimension);
    if (rate === undefined) throw new PricingError(`unpriced dimension ${dimension}`);
    total += chargeFor(count, rate);
  }
  return total;
}

/** Settlement: the tier implied by the actual input tokens, each dimension rounded up once. */
export function settlementMicros(pricing: PricingVersion, usage: TokenCounts): bigint {
  const input = inputTokens(usage);
  const tier = [...pricing.tiers]
    .reverse()
    .find((candidate) => input >= BigInt(candidate.fromInputTokens));
  if (tier === undefined) throw new PricingError('no tier applies');
  return priced(usage, (dimension) => tier.rates[dimension]);
}

/**
 * Reservation: every bounded dimension at its highest rate over all tiers, so a bound that crosses
 * a long-context threshold or writes 1-hour cache is never under-reserved.
 */
export function reservationMicros(pricing: PricingVersion, bound: TokenCounts): bigint {
  // Compare rationals exactly by cross-multiplication.
  const highest = (dimension: BillingDimension): Rate | undefined =>
    pricing.tiers
      .map((tier) => tier.rates[dimension])
      .filter((rate): rate is Rate => rate !== undefined)
      .reduce<Rate | undefined>(
        (best, rate) =>
          best === undefined || rate.micros * best.perTokens > best.micros * rate.perTokens
            ? rate
            : best,
        undefined,
      );
  return priced(bound, highest);
}

/** For logs and reports only: microdollars as a decimal dollar string, exact. */
export function formatDollars(micros: bigint): string {
  const sign = micros < 0n ? '-' : '';
  const magnitude = micros < 0n ? -micros : micros;
  const cents = (magnitude % 1_000_000n).toString().padStart(6, '0');
  return `${sign}$${(magnitude / 1_000_000n).toString()}.${cents}`;
}

/** Parses a positive integer microdollar amount given as decimal digits; anything else throws. */
export function positiveMicros(text: string): bigint {
  if (!/^[1-9][0-9]{0,18}$/.test(text)) throw new PricingError('expected positive microdollars');
  const value = BigInt(text);
  if (value > MAX_MICROS) throw new PricingError('microdollar amount too large');
  return value;
}

/** Largest amount PostgreSQL `bigint` holds. */
export const MAX_MICROS = (1n << 63n) - 1n;
