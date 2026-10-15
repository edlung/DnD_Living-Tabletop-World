import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ProviderResponse, ResponseFacts } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { FIXTURE_SONNET } from '../testing/catalog-fixtures.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { KEY, NEVER, REQUEST } from '../testing/raw-adapter-fixtures.ts';
import { ROUTE_CAPABILITIES } from '../platform/config/ai-routes.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { CLAUDE_SONNET_5_5 } from './catalog-sonnet-5-5.ts';
import { VERIFIED_CATALOG, verifiedCatalog } from './catalog.ts';
import { priceUsage, reservationFor } from './pricing.ts';
import { ANTHROPIC_REQUEST_SETTINGS } from './request-settings.ts';

/**
 * The verified Sonnet 5.5 entry (checkpoint C) against its record,
 * `reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`: identity, prices,
 * limits, the reservation of the record's example, the exact request the adapter sends, and
 * fail-closed usage. Injected `fetch` only; nothing reaches the network.
 */
const MODEL = 'claude-sonnet-5-5';

/** A response carrying every field the record documents or saw, at its accepted value. */
const USAGE = {
  input_tokens: 1_000,
  output_tokens: 300,
  cache_creation_input_tokens: 400,
  cache_read_input_tokens: 2_000,
  cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 0 },
  output_tokens_details: { thinking_tokens: 120 },
  server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
  service_tier: 'standard',
  inference_geo: 'global',
  speed: 'standard',
  fallback_credit: null,
  iterations: [
    {
      type: 'message',
      input_tokens: 1_000,
      output_tokens: 300,
      cache_creation_input_tokens: 400,
      cache_read_input_tokens: 2_000,
    },
  ],
};
// 1,000 × 2 + 400 × 2.5 + ceil(2,000 × 0.1) + 300 × 10: thinking is inside the output, once.
const USAGE_MICROS = 2_000n + 1_000n + 200n + 3_000n;

/** `model` null omits the field. */
const reply = (usage: unknown, model: string | null = MODEL) => ({
  id: 'msg_sonnet_1',
  ...(model === null ? {} : { model }),
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'toolu_1', name: REQUEST.output.name, input: { ok: true } }],
  usage,
});

/** The adapter exactly as `gateway.ts` builds it for a capability. */
function adapter(capability: (typeof ROUTE_CAPABILITIES)[number], answer: unknown = reply(USAGE)) {
  const fake = fakeFetch(() => jsonResponse(answer));
  const settings = ANTHROPIC_REQUEST_SETTINGS[capability];
  const provider = createAnthropicProvider({
    apiKey: () => KEY,
    model: MODEL,
    acceptedModels: [CLAUDE_SONNET_5_5.model, ...CLAUDE_SONNET_5_5.aliases],
    timeoutMs: 1_000,
    effort: settings.effort,
    maxTokens: settings.maxTokens,
    cache: '5m',
    fetch: fake.fetchImpl,
  });
  return { provider, fake };
}

/** The response's safe facts; a denial has none and fails the test. */
function factsOf(result: ProviderResponse): ResponseFacts {
  if (!('billing' in result)) throw new Error(`no response facts: ${result.kind}`);
  return result;
}

async function answer(usage: unknown): Promise<ProviderResponse> {
  const { provider } = adapter('npc-dialogue', reply(usage));
  return provider.dispatch(provider.prepare(REQUEST), NEVER, () => undefined);
}

describe('the verified Sonnet 5.5 entry', () => {
  it('matches the verification record exactly', () => {
    expect(() => verifiedCatalog([CLAUDE_SONNET_5_5])).not.toThrow();
    expect(VERIFIED_CATALOG.entries).toEqual([CLAUDE_SONNET_5_5]);
    expect(CLAUDE_SONNET_5_5).toMatchObject({
      provider: 'anthropic',
      model: MODEL,
      aliases: [MODEL],
      history: [],
      limits: { maxInputTokens: 1_000_000, maxOutputTokens: 128_000 },
      cache: '5m',
      verification: {
        source: 'reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md',
        verifiedOn: '2026-10-12',
      },
    });
    expect(CLAUDE_SONNET_5_5.limits.maxRequestBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
    const record = fileURLToPath(
      new URL(`../../../../${CLAUDE_SONNET_5_5.verification.source}`, import.meta.url),
    );
    expect(existsSync(record)).toBe(true);
    // No context tiers; µ$ per token: input 2, 5-minute write 2.5, read 0.1, output 10.
    expect(CLAUDE_SONNET_5_5.pricing).toEqual({
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
    });
    expect(CLAUDE_SONNET_5_5.usage.labels).toEqual({
      service_tier: ['standard'],
      inference_geo: ['global'],
      'server_tool_use.web_search_requests': ['0'],
      'server_tool_use.web_fetch_requests': ['0'],
      speed: ['standard'],
      iterations: ['message'],
    });
  });

  it('reserves the record’s example: $2.50 + 4,096 × $0.00001 = 2,540,960 µ$', () => {
    const provider = createAnthropicProvider({
      apiKey: () => KEY,
      model: MODEL,
      timeoutMs: 1_000,
      effort: 'low',
      maxTokens: 4_096,
      cache: '5m',
    });
    expect(reservationFor(CLAUDE_SONNET_5_5, provider.prepare(REQUEST))).toEqual({
      ok: true,
      micros: 2_540_960n,
    });
  });

  it.each(ROUTE_CAPABILITIES)(
    'sends a body Sonnet 5.5 accepts for %s, within the entry, at its reservation',
    (capability) => {
      const { provider } = adapter(capability);
      const prepared = provider.prepare(REQUEST);
      const body = JSON.parse(prepared.body) as Record<string, unknown>;
      const { effort, maxTokens } = ANTHROPIC_REQUEST_SETTINGS[capability];
      expect(Object.keys(body).sort()).toEqual(
        [
          'max_tokens',
          'messages',
          'model',
          'output_config',
          'system',
          'tool_choice',
          'tools',
        ].sort(),
      );
      // No forced tool, no disabled thinking (adaptive), no sampling parameters, no prefill.
      expect(body['tool_choice']).toEqual({ type: 'auto' });
      expect(body).not.toHaveProperty('thinking');
      for (const sampling of ['temperature', 'top_p', 'top_k']) {
        expect(body).not.toHaveProperty(sampling);
      }
      expect(body['messages']).toEqual([{ role: 'user', content: REQUEST.prompt }]);
      expect(body['output_config']).toEqual({ effort });
      expect(body['max_tokens']).toBe(maxTokens);
      expect(reservationFor(CLAUDE_SONNET_5_5, prepared)).toEqual({
        ok: true,
        micros: 2_500_000n + BigInt(maxTokens) * 10n,
      });
    },
  );

  it('keeps relevance at low effort and every capability below the default effort', () => {
    expect(ANTHROPIC_REQUEST_SETTINGS['fast-context'].effort).toBe('low');
    for (const capability of ROUTE_CAPABILITIES) {
      expect(['low', 'medium']).toContain(ANTHROPIC_REQUEST_SETTINGS[capability].effort);
    }
  });

  it.each([
    ['the default (high) effort', { effort: 'high' as const }],
    ['a max_tokens over the documented output limit', { maxTokens: 128_001 }],
  ])('refuses %s before admission', (_label, options) => {
    const provider = createAnthropicProvider({
      apiKey: () => KEY,
      model: MODEL,
      timeoutMs: 1_000,
      effort: 'low',
      cache: '5m',
      ...options,
    });
    expect(reservationFor(CLAUDE_SONNET_5_5, provider.prepare(REQUEST)).ok).toBe(false);
  });
});

describe('Sonnet 5.5 usage', () => {
  it('prices every documented and conservatively accepted field', async () => {
    const result = await answer(USAGE);
    expect(result.kind).toBe('output');
    expect(priceUsage(CLAUDE_SONNET_5_5, factsOf(result))).toMatchObject({
      kind: 'known',
      micros: USAGE_MICROS,
    });
    // Absent optional fields are accepted too, and a null tier, geography or speed reads as the
    // default (owner decisions 6, nullUsageLabels); explicit other values fail closed (below).
    const nulls = await answer({
      input_tokens: 10,
      output_tokens: 2,
      service_tier: null,
      inference_geo: null,
      speed: null,
    });
    expect(priceUsage(CLAUDE_SONNET_5_5, factsOf(nulls))).toMatchObject({
      kind: 'known',
      micros: 40n,
    });
    const minimal = await answer({ input_tokens: 10, output_tokens: 2 });
    expect(priceUsage(CLAUDE_SONNET_5_5, factsOf(minimal))).toMatchObject({
      kind: 'known',
      micros: 40n,
    });
  });

  it('accepts only the fields the entry lists: the fixture entry refuses Sonnet labels', async () => {
    expect(priceUsage(FIXTURE_SONNET, factsOf(await answer(USAGE)))).toEqual({
      kind: 'unverified',
    });
  });

  it.each([
    ['a priority service tier', { service_tier: 'priority' }],
    ['a batch service tier', { service_tier: 'batch' }],
    ['US-only inference', { inference_geo: 'us' }],
    ['an unknown inference geography', { inference_geo: 'eu' }],
    ['a web search', { server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } }],
    ['a web fetch', { server_tool_use: { web_search_requests: 0, web_fetch_requests: 2 } }],
    ['an unknown server tool', { server_tool_use: { code_execution_requests: 0 } }],
    ['an unknown top-level field', { audio_tokens: 3 }],
    ['an unknown nested field', { output_tokens_details: { audio_tokens: 3 } }],
    ['fast mode', { speed: 'fast' }],
    ['a fallback credit', { fallback_credit: { amount: 1 } }],
    [
      'an iteration of another type',
      { iterations: [{ ...USAGE.iterations[0], type: 'fallback' }] },
    ],
    [
      'iterations that do not add up',
      { iterations: [{ ...USAGE.iterations[0], output_tokens: 299 }] },
    ],
    [
      'two iterations beyond the top-level counts',
      { iterations: [USAGE.iterations[0], USAGE.iterations[0]] },
    ],
    ['an iteration with an unknown field', { iterations: [{ ...USAGE.iterations[0], cost: 1 }] }],
    ['empty iterations', { iterations: [] }],
  ])('treats %s as unverified billing: no output, hold kept', async (_label, change) => {
    const result = await answer({ ...USAGE, ...change });
    expect(result).toMatchObject({ kind: 'suspect', code: 'UNVERIFIED_BILLING' });
    expect(result).not.toHaveProperty('output');
  });

  it.each([
    ['more thinking than output', { output_tokens_details: { thinking_tokens: 301 } }],
    [
      'a 1-hour cache write (never requested, not priced)',
      {
        cache_creation_input_tokens: 400,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 400 },
      },
    ],
    [
      'a cache-write total without its split',
      { cache_creation_input_tokens: 400, cache_creation: null },
    ],
  ])('prices %s as unverified billing', async (_label, change) => {
    const result = await answer({ ...USAGE, iterations: null, ...change });
    expect(result.kind).toBe('output');
    expect(priceUsage(CLAUDE_SONNET_5_5, factsOf(result))).toEqual({ kind: 'unverified' });
  });

  it.each([
    ['another model', 'claude-opus-5-5'],
    ['a dated version without a verified mapping', 'claude-sonnet-5-5-20261012'],
    ['the fixture alias', 'claude-sonnet-5-5-fixture-snapshot'],
    ['no model', null],
  ])('treats %s in the response as UNEXPECTED_MODEL', async (_label, model) => {
    const { provider } = adapter('reasoning', reply(USAGE, model));
    const result = await provider.dispatch(provider.prepare(REQUEST), NEVER, () => undefined);
    expect(result).toMatchObject({ kind: 'suspect', code: 'UNEXPECTED_MODEL' });
    expect(result).not.toHaveProperty('output');
  });
});
