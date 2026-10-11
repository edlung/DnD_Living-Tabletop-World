import type { ResponseFacts } from '@ltw/ai';

import {
  BILLING_DIMENSIONS,
  PricingError,
  reservationMicros,
  settlementMicros,
  type BillingDimension,
  type TokenCounts,
} from './accounting/money.ts';
import type { CatalogEntry } from './catalog.ts';
import type { PreparedRequest } from './raw-provider.ts';

/**
 * Prices an admitted attempt against its verified catalog entry (docs/STAGE_300_REMEDIATION_DESIGN.md
 * §1; docs/adr/0032-live-ai.md, B2).
 *
 * The reservation is computed from the exact prepared body, which `dispatch` cannot change. The
 * body must fit the entry's allowlists (top-level fields, option values, model name, `max_tokens`,
 * request bytes, a cache breakpoint only where the entry permits one). With no verified tokenizer
 * byte bound, the input bound is the model's full documented context, priced at the highest input
 * rate of any dimension and tier (uncached, cache read, 5-minute or 1-hour cache write); output is
 * `max_tokens` at the highest output rate (reasoning is billed as output, within `max_tokens`). The
 * provider refuses a request beyond its context and stops output at `max_tokens`, so the bound
 * dominates any charge the verified pricing contract allows.
 *
 * Settlement prices validated usage at the tier its actual input implies. Usage outside the entry's
 * dimensions or labels, inconsistent totals or an unpriced dimension are unverified billing: the
 * hold stays and the route stops. Absent usage is unknown: the hold stays.
 */
export type Reservation =
  { readonly ok: true; readonly micros: bigint } | { readonly ok: false; readonly reason: string };

const INPUT: readonly BillingDimension[] = [
  'uncachedInput',
  'cacheRead',
  'cacheWrite5m',
  'cacheWrite1h',
];

const refuse = (reason: string): Reservation => ({ ok: false, reason });

export function reservationFor(entry: CatalogEntry, prepared: PreparedRequest): Reservation {
  if (prepared.provider !== entry.provider) return refuse('provider');
  if (Buffer.byteLength(prepared.body, 'utf8') > entry.limits.maxRequestBytes)
    return refuse('size');
  let body: Readonly<Record<string, unknown>>;
  try {
    body = JSON.parse(prepared.body) as Readonly<Record<string, unknown>>;
  } catch {
    return refuse('body');
  }
  for (const field of Object.keys(body)) {
    if (!entry.request.fields.includes(field)) return refuse('field');
  }
  for (const [field, permitted] of Object.entries(entry.request.options)) {
    if (field in body && !permitted.includes(JSON.stringify(body[field]))) return refuse('option');
  }
  const model = body['model'];
  if (typeof model !== 'string' || (model !== entry.model && !entry.aliases.includes(model))) {
    return refuse('model');
  }
  const maxTokens = body['max_tokens'];
  if (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
    return refuse('max_tokens');
  }
  if (maxTokens > entry.limits.maxOutputTokens) return refuse('max_tokens');
  if (Array.isArray(body['system']) && entry.cache !== '5m') return refuse('cache');
  try {
    const priced = INPUT.filter((dimension) =>
      entry.pricing.tiers.some((tier) => tier.rates[dimension] !== undefined),
    );
    if (priced.length === 0) return refuse('pricing');
    const input = priced
      .map((dimension) =>
        reservationMicros(entry.pricing, { [dimension]: entry.limits.maxInputTokens }),
      )
      .reduce((highest, micros) => (micros > highest ? micros : highest), 0n);
    return { ok: true, micros: input + reservationMicros(entry.pricing, { output: maxTokens }) };
  } catch (error) {
    if (error instanceof PricingError) return refuse('pricing');
    throw error;
  }
}

export type PricedUsage =
  | {
      readonly kind: 'known';
      readonly micros: bigint;
      readonly counts: TokenCounts;
      readonly usage: Readonly<Record<string, number>>;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unverified' };

const UNVERIFIED: PricedUsage = { kind: 'unverified' };

/** The provider's usage counts as billing dimensions, or null when they are inconsistent. */
function countsOf(
  entry: CatalogEntry,
  usage: Readonly<Record<string, number>>,
): TokenCounts | null {
  const get = (field: string) => usage[field];
  if (entry.provider === 'anthropic') {
    const input = get('input_tokens');
    const output = get('output_tokens');
    if (input === undefined || output === undefined) return null;
    const total = get('cache_creation_input_tokens');
    const five = get('cache_creation.ephemeral_5m_input_tokens');
    const hour = get('cache_creation.ephemeral_1h_input_tokens');
    const split = five !== undefined || hour !== undefined;
    if (split && total !== undefined && total !== (five ?? 0) + (hour ?? 0)) return null;
    return {
      uncachedInput: input,
      cacheRead: get('cache_read_input_tokens') ?? 0,
      // Writes reported only as a total are priced at the higher, 1-hour rate.
      cacheWrite5m: split ? (five ?? 0) : 0,
      cacheWrite1h: split ? (hour ?? 0) : (total ?? 0),
      output,
    };
  }
  const prompt = get('prompt_tokens');
  const completion = get('completion_tokens');
  if (prompt === undefined || completion === undefined) return null;
  const total = get('total_tokens');
  if (total !== undefined && total !== prompt + completion) return null;
  const reasoning = get('completion_tokens_details.reasoning_tokens');
  if (reasoning !== undefined && reasoning > completion) return null;
  const hit = get('prompt_cache_hit_tokens');
  const miss = get('prompt_cache_miss_tokens');
  if (hit === undefined || miss === undefined) {
    // Without the split every prompt token is priced as uncached, the higher input rate.
    return hit === undefined && miss === undefined
      ? { uncachedInput: prompt, output: completion }
      : null;
  }
  if (hit + miss !== prompt) return null;
  return { uncachedInput: miss, cacheRead: hit, output: completion };
}

export function priceUsage(entry: CatalogEntry, facts: ResponseFacts): PricedUsage {
  const billing = facts.billing;
  if (billing === null) return { kind: 'missing' };
  if (billing.unrecognized.length > 0) return UNVERIFIED;
  for (const field of Object.keys(billing.dimensions)) {
    if (!entry.usage.dimensions.includes(field)) return UNVERIFIED;
  }
  for (const [field, value] of Object.entries(billing.informational)) {
    if (!(entry.usage.labels[field] ?? []).includes(value)) return UNVERIFIED;
  }
  const counts = countsOf(entry, billing.dimensions);
  if (counts === null) return UNVERIFIED;
  try {
    for (const dimension of BILLING_DIMENSIONS) {
      if ((counts[dimension] ?? 0) < 0) return UNVERIFIED;
    }
    return {
      kind: 'known',
      micros: settlementMicros(entry.pricing, counts),
      counts,
      usage: billing.dimensions,
    };
  } catch (error) {
    if (error instanceof PricingError) return UNVERIFIED;
    throw error;
  }
}
