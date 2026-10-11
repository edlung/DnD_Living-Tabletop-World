import { verifiedCatalog, type CatalogEntry } from '../ai/catalog.ts';

/**
 * Test support: catalog entries for tests only (docs/adr/0032-live-ai.md, B2). PRICES, LIMITS AND
 * ALIASES HERE ARE INVENTED FIXTURES, NOT PROVIDER PRICES: catalog verification has not been
 * authorized, and nothing here may be copied into the production catalog. The numbers are small
 * and round so reservations and settlements can be checked by hand.
 *
 * Anthropic fixture (`claude-sonnet-5-5`): context tier at 10,000 input tokens; per token, below /
 * above it: uncached input 3 / 6 µ$, cache read 0.3 / 0.6, 5-minute write 3.75 / 7.5, 1-hour write
 * 6 / 12, output 15 / 22.5. Full-context bound 20,000 tokens, output at most 4,096.
 */
export const FIXTURE_SONNET: CatalogEntry = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  aliases: ['claude-sonnet-5-5-fixture-snapshot'],
  pricing: {
    version: 'fixture-anthropic-sonnet-2',
    tiers: [
      {
        fromInputTokens: 0,
        rates: {
          uncachedInput: { micros: 3n, perTokens: 1n },
          cacheRead: { micros: 3n, perTokens: 10n },
          cacheWrite5m: { micros: 15n, perTokens: 4n },
          cacheWrite1h: { micros: 6n, perTokens: 1n },
          output: { micros: 15n, perTokens: 1n },
        },
      },
      {
        fromInputTokens: 10_000,
        rates: {
          uncachedInput: { micros: 6n, perTokens: 1n },
          cacheRead: { micros: 3n, perTokens: 5n },
          cacheWrite5m: { micros: 15n, perTokens: 2n },
          cacheWrite1h: { micros: 12n, perTokens: 1n },
          output: { micros: 45n, perTokens: 2n },
        },
      },
    ],
  },
  history: [
    { pricingVersion: 'fixture-anthropic-sonnet-1', models: ['claude-sonnet-legacy-alias'] },
  ],
  limits: { maxInputTokens: 20_000, maxOutputTokens: 4_096, maxRequestBytes: 200_000 },
  usage: {
    dimensions: [
      'input_tokens',
      'output_tokens',
      'cache_creation_input_tokens',
      'cache_read_input_tokens',
      'cache_creation.ephemeral_5m_input_tokens',
      'cache_creation.ephemeral_1h_input_tokens',
    ],
    labels: { service_tier: ['standard'] },
  },
  request: {
    fields: ['model', 'max_tokens', 'system', 'messages', 'tools', 'tool_choice'],
    options: {},
  },
  cache: '5m',
  verification: {
    source: 'test fixture: not verified, not a provider price',
    verifiedOn: '1970-01-01',
  },
};

/** DeepSeek fixture: uncached input 1 µ$/token, cache hit 0.1, output 2; bound 8,000 tokens. */
export const FIXTURE_DEEPSEEK: CatalogEntry = {
  provider: 'deepseek',
  model: 'deepseek-flash',
  aliases: [],
  pricing: {
    version: 'fixture-deepseek-1',
    tiers: [
      {
        fromInputTokens: 0,
        rates: {
          uncachedInput: { micros: 1n, perTokens: 1n },
          cacheRead: { micros: 1n, perTokens: 10n },
          output: { micros: 2n, perTokens: 1n },
        },
      },
    ],
  },
  history: [],
  limits: { maxInputTokens: 8_000, maxOutputTokens: 4_096, maxRequestBytes: 200_000 },
  usage: {
    dimensions: [
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'prompt_cache_hit_tokens',
      'prompt_cache_miss_tokens',
      'prompt_tokens_details.cached_tokens',
      'completion_tokens_details.reasoning_tokens',
    ],
    labels: {},
  },
  request: {
    fields: ['model', 'max_tokens', 'messages', 'tools', 'tool_choice', 'thinking'],
    options: { thinking: ['{"type":"disabled"}'] },
  },
  cache: null,
  verification: {
    source: 'test fixture: not verified, not a provider price',
    verifiedOn: '1970-01-01',
  },
};

export const FIXTURE_CATALOG = verifiedCatalog([FIXTURE_SONNET, FIXTURE_DEEPSEEK]);
