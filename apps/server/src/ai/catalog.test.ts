import type { ResponseFacts } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOG, FIXTURE_DEEPSEEK, FIXTURE_SONNET } from '../testing/catalog-fixtures.ts';
import {
  CatalogError,
  VERIFIED_CATALOG,
  canonicalModel,
  configuredEntry,
  verifiedCatalog,
} from './catalog.ts';
import { priceUsage } from './pricing.ts';

/**
 * The verified catalog (docs/STAGE_300_REMEDIATION_DESIGN.md §1; B2 stop-scope delta): consistent
 * identity, fail-closed resolution, and pricing of validated usage. Fixture entries only.
 */
describe('the catalog', () => {
  it('is empty in this build: catalog verification is not authorized', () => {
    expect(VERIFIED_CATALOG.entries).toEqual([]);
    expect(configuredEntry(VERIFIED_CATALOG, 'anthropic', 'claude-sonnet-5-5')).toBeNull();
    expect(canonicalModel(VERIFIED_CATALOG, 'anthropic', 'claude-sonnet-5-5', null)).toBeNull();
  });

  it('resolves configured names and verified aliases to one canonical model', () => {
    expect(configuredEntry(FIXTURE_CATALOG, 'anthropic', 'claude-sonnet-5-5')).toBe(FIXTURE_SONNET);
    expect(
      configuredEntry(FIXTURE_CATALOG, 'anthropic', 'claude-sonnet-5-5-fixture-snapshot'),
    ).toBe(FIXTURE_SONNET);
    // A historical alias is not a configurable name, and a provider label is not interchangeable.
    expect(configuredEntry(FIXTURE_CATALOG, 'anthropic', 'claude-sonnet-legacy-alias')).toBeNull();
    expect(configuredEntry(FIXTURE_CATALOG, 'deepseek', 'claude-sonnet-5-5')).toBeNull();
  });

  it('resolves recorded identities through current and historical mappings, else null', () => {
    const resolve = (model: string, version: string | null, provider = 'anthropic') =>
      canonicalModel(FIXTURE_CATALOG, provider, model, version);
    expect(resolve('claude-sonnet-5-5', 'fixture-anthropic-sonnet-2')).toBe('claude-sonnet-5-5');
    expect(resolve('claude-sonnet-legacy-alias', 'fixture-anthropic-sonnet-1')).toBe(
      'claude-sonnet-5-5',
    );
    expect(resolve('claude-sonnet-legacy-alias', null)).toBe('claude-sonnet-5-5');
    // The legacy alias is not a mapping of the current version, and unknowns never resolve.
    expect(resolve('claude-sonnet-legacy-alias', 'fixture-anthropic-sonnet-2')).toBeNull();
    expect(resolve('claude-sonnet-5-5', 'unknown-version')).toBeNull();
    expect(resolve('claude-other', null)).toBeNull();
    expect(resolve('deepseek-flash', null, 'anthropic')).toBeNull();
  });

  it.each([
    [
      'an alias meaning two models',
      [
        FIXTURE_SONNET,
        {
          ...FIXTURE_SONNET,
          model: 'claude-x',
          pricing: { ...FIXTURE_SONNET.pricing, version: 'v-x' },
          history: [],
        },
      ],
    ],
    [
      'a reused pricing version',
      [
        FIXTURE_SONNET,
        {
          ...FIXTURE_DEEPSEEK,
          pricing: { ...FIXTURE_DEEPSEEK.pricing, version: 'fixture-anthropic-sonnet-1' },
        },
      ],
    ],
    [
      'tiers not starting at zero',
      [
        {
          ...FIXTURE_DEEPSEEK,
          pricing: { version: 'v', tiers: [{ fromInputTokens: 5, rates: {} }] },
        },
      ],
    ],
    [
      'a non-positive limit',
      [{ ...FIXTURE_DEEPSEEK, limits: { ...FIXTURE_DEEPSEEK.limits, maxInputTokens: 0 } }],
    ],
  ])('refuses a catalog with %s', (_label, entries) => {
    expect(() => verifiedCatalog(entries)).toThrow(CatalogError);
  });
});

const facts = (dimensions: Record<string, number>, informational = {}): ResponseFacts => ({
  model: 'deepseek-flash',
  usage: null,
  providerRequestId: null,
  billing: { dimensions, informational, unrecognized: [] },
});

describe('pricing DeepSeek usage', () => {
  it('prices cache hits and misses separately, without double counting the total', () => {
    const priced = priceUsage(
      FIXTURE_DEEPSEEK,
      facts({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 64,
        prompt_cache_miss_tokens: 36,
        'prompt_tokens_details.cached_tokens': 64,
        'completion_tokens_details.reasoning_tokens': 5,
      }),
    );
    // 36 × 1 + ceil(64 × 0.1) + 20 × 2: reasoning is part of the completion, priced once.
    expect(priced).toMatchObject({ kind: 'known', micros: 36n + 7n + 40n });
  });

  it('prices every prompt token as uncached when the split is absent', () => {
    expect(
      priceUsage(FIXTURE_DEEPSEEK, facts({ prompt_tokens: 100, completion_tokens: 20 })),
    ).toMatchObject({ kind: 'known', micros: 140n });
  });

  it.each([
    ['inconsistent totals', { prompt_tokens: 100, completion_tokens: 20, total_tokens: 999 }],
    [
      'a split that does not add up',
      {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_cache_hit_tokens: 64,
        prompt_cache_miss_tokens: 1,
      },
    ],
    ['half a split', { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 64 }],
    [
      'more reasoning than completion',
      { prompt_tokens: 1, completion_tokens: 2, 'completion_tokens_details.reasoning_tokens': 3 },
    ],
    ['a missing required count', { prompt_tokens: 100 }],
    ['an Anthropic dimension', { prompt_tokens: 1, completion_tokens: 1, input_tokens: 1 }],
  ])('treats %s as unverified billing', (_label, dimensions) => {
    expect(priceUsage(FIXTURE_DEEPSEEK, facts(dimensions))).toEqual({ kind: 'unverified' });
  });

  it('refuses a label value the entry does not allow, and keeps absent usage unknown', () => {
    expect(
      priceUsage(FIXTURE_SONNET, {
        ...facts({ input_tokens: 1, output_tokens: 1 }, { service_tier: 'priority' }),
      }),
    ).toEqual({ kind: 'unverified' });
    expect(priceUsage(FIXTURE_SONNET, { ...facts({}), billing: null })).toEqual({
      kind: 'missing',
    });
  });

  it('refuses a dimension the entry has no rate for', () => {
    const noCacheRates = {
      ...FIXTURE_DEEPSEEK,
      pricing: {
        version: 'fixture-deepseek-no-cache',
        tiers: [
          {
            fromInputTokens: 0,
            rates: {
              uncachedInput: { micros: 1n, perTokens: 1n },
              output: { micros: 2n, perTokens: 1n },
            },
          },
        ],
      },
    };
    expect(
      priceUsage(
        noCacheRates,
        facts({
          prompt_tokens: 10,
          completion_tokens: 1,
          prompt_cache_hit_tokens: 4,
          prompt_cache_miss_tokens: 6,
        }),
      ),
    ).toEqual({ kind: 'unverified' });
  });
});
