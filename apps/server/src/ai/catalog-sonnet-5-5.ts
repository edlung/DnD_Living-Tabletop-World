import type { CatalogEntry } from './catalog.ts';

/**
 * The one verified catalog entry (checkpoint C): Anthropic `claude-sonnet-5-5`, exactly as the
 * owner-authorized catalog verification of 2026-10-12 records it
 * (`reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`; first-party Claude
 * API only). Owner decision 3 (2026-10-11) makes Sonnet 5.5 the only runtime text model; no other
 * model has an entry.
 *
 * - Identity: canonical model, only alias and only accepted response model `claude-sonnet-5-5`.
 * - Prices (µ$ per token): input 2, 5-minute cache write 2.5, cache read 0.1, output 10 (thinking
 *   is billed as output, inside `max_tokens`). No context tiers: the full 1M context bills at
 *   standard rates. The adapter only ever sends a 5-minute breakpoint, so the 1-hour write rate is
 *   deliberately not priced: a reported 1-hour write (or a cache-write total without its split,
 *   priced as 1-hour) is unpriced, hence unverified billing, never a guess.
 * - Reservation: with no verified tokenizer byte bound, the input bound is the full 1,000,000-token
 *   context at the highest priced input rate (2.5 µ$, the 5-minute write), plus `max_tokens` × 10:
 *   $2.50 + max_tokens × $0.00001 (2,540,960 µ$ at 4,096 output tokens).
 * - Usage: the documented counts and the thinking decomposition; `service_tier` only `standard`,
 *   `inference_geo` only `global` (the request never sets it; any other value has another price);
 *   server-tool counts only zero or absent. The fields seen outside the public schema are accepted
 *   only conservatively: `speed` `standard`, `fallback_credit` null, `iterations` message entries
 *   that add up to the top-level counts (`usage-facts.ts`). Anything else fails closed.
 * - Request: exactly the adapter's body (`anthropic-provider.ts`, settings from
 *   `request-settings.ts`): no `thinking` (adaptive), no sampling parameters, no prefill, `auto`
 *   tool choice, effort `low` or `medium` only.
 * - Request size: 32,000,000 bytes, below the Messages API's 32 MB limit.
 */
export const CLAUDE_SONNET_5_5: CatalogEntry = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  aliases: ['claude-sonnet-5-5'],
  pricing: {
    version: 'anthropic-claude-sonnet-5-5-2026-10-12',
    tiers: [
      {
        fromInputTokens: 0,
        rates: {
          uncachedInput: { micros: 2n, perTokens: 1n },
          cacheWrite5m: { micros: 5n, perTokens: 2n },
          cacheRead: { micros: 1n, perTokens: 10n },
          output: { micros: 10n, perTokens: 1n },
        },
      },
    ],
  },
  history: [],
  limits: { maxInputTokens: 1_000_000, maxOutputTokens: 128_000, maxRequestBytes: 32_000_000 },
  usage: {
    dimensions: [
      'input_tokens',
      'output_tokens',
      'cache_creation_input_tokens',
      'cache_read_input_tokens',
      'cache_creation.ephemeral_5m_input_tokens',
      'cache_creation.ephemeral_1h_input_tokens',
      'output_tokens_details.thinking_tokens',
    ],
    labels: {
      service_tier: ['standard'],
      inference_geo: ['global'],
      'server_tool_use.web_search_requests': ['0'],
      'server_tool_use.web_fetch_requests': ['0'],
      speed: ['standard'],
      iterations: ['message'],
    },
  },
  request: {
    fields: ['model', 'max_tokens', 'output_config', 'system', 'messages', 'tools', 'tool_choice'],
    options: {
      output_config: ['{"effort":"low"}', '{"effort":"medium"}'],
      tool_choice: ['{"type":"auto"}'],
    },
  },
  cache: '5m',
  verification: {
    source: 'reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md',
    verifiedOn: '2026-10-12',
  },
};
