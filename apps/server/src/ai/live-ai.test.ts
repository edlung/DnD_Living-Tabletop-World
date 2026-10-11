import { intentRequest, type ProviderRequest } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig, obsoleteVariables } from '../platform/config/config.ts';
import { routeIssues } from '../platform/config/ai-routes.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider.ts';

/**
 * Stage 300 (docs/adr/0032-live-ai.md): the DeepSeek adapter's wire format over injected `fetch`
 * (the shared raw adapter contract is `raw-adapters.test.ts`), and route validation. No network.
 * Composition builds no remote adapter at checkpoints A and B1 (`gateway.test.ts`).
 */
const REQUEST: ProviderRequest = intentRequest(
  'Advance time by 1 hour.',
  { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
  null,
);
const KEY = 'sk-test-deepseek-never-shown';

describe('the OpenAI-compatible adapter', () => {
  it('prepares a forced function call with thinking off, from an allowlist', async () => {
    const fake = fakeFetch(() => jsonResponse({}));
    const deepseek = createOpenAiCompatibleProvider({
      id: 'deepseek',
      baseUrl: 'https://example.test',
      apiKey: () => KEY,
      model: 'deepseek-flash',
      timeoutMs: 1_000,
      thinking: 'disabled',
      fetch: fake.fetchImpl,
    });
    const prepared = deepseek.prepare(REQUEST);

    expect(prepared.url).toBe('https://example.test/chat/completions');
    expect(JSON.parse(prepared.body)).toEqual({
      model: 'deepseek-flash',
      max_tokens: 4_096,
      messages: [
        { role: 'system', content: REQUEST.system },
        { role: 'user', content: REQUEST.prompt },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'propose_commands',
            description: REQUEST.output.description,
            parameters: REQUEST.output.schema,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'propose_commands' } },
      thinking: { type: 'disabled' },
    });
    await deepseek
      .dispatch(prepared, new AbortController().signal, () => undefined)
      .catch(() => undefined);
    expect((fake.calls[0]?.init.headers as Record<string, string>)['authorization']).toBe(
      `Bearer ${KEY}`,
    );
    expect(fake.calls[0]?.body).not.toContain(KEY);
  });
});

describe('route configuration', () => {
  const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-route', DEEPSEEK_API_KEY: 'sk-route' };
  const routesOf = (text: string) => loadConfig({ ...KEYS, LTW_AI_ROUTES: text }).ai.routes;
  const issuesOf = (text: string) => {
    try {
      routesOf(text);
      return [];
    } catch (error) {
      if (error instanceof ConfigError) return error.issues;
      throw error;
    }
  };

  it('accepts local, one remote then local, and one remote ranker', () => {
    expect(
      routesOf(
        'reasoning=anthropic:claude-opus-5-5,local;npc-dialogue=local;narrative=deepseek:deepseek-flash,local;fast-context=deepseek:deepseek-flash',
      ),
    ).toEqual({
      reasoning: ['anthropic:claude-opus-5-5', 'local'],
      'npc-dialogue': ['local'],
      narrative: ['deepseek:deepseek-flash', 'local'],
      'fast-context': ['deepseek:deepseek-flash'],
    });
  });

  it.each([
    ['three entries', 'narrative=anthropic:claude-opus-5-5,deepseek:deepseek-flash,local'],
    ['two remotes', 'reasoning=anthropic:claude-opus-5-5,deepseek:deepseek-flash'],
    ['a remote-only intent route', 'reasoning=anthropic:claude-opus-5-5'],
    ['local before the remote', 'npc-dialogue=local,anthropic:claude-sonnet-5-5'],
    ['local twice', 'narrative=local,local'],
    ['a local ranker', 'fast-context=local'],
    ['a ranker with a local fallback', 'fast-context=deepseek:deepseek-flash,local'],
    ['a capability twice', 'reasoning=local;reasoning=anthropic:claude-opus-5-5,local'],
    ['an unknown provider', 'reasoning=openai:gpt'],
    ['an empty list', 'reasoning='],
    [
      'a second "=" after a list',
      'reasoning=anthropic:claude-opus-5-5,local=deepseek:deepseek-flash',
    ],
    [
      'a second "=" after a ranker',
      'fast-context=deepseek:deepseek-flash=anthropic:claude-opus-5-5',
    ],
    ['a second "=" after local', 'reasoning=local=anthropic:claude-opus-5-5'],
    ['no "=" at all', 'reasoning'],
  ])('rejects %s at runtime rather than truncating it', (_label, text) => {
    const issues = issuesOf(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join('\n')).not.toMatch(/claude-|deepseek-flash|gpt|sk-/);
  });

  it('refuses a remote entry whose provider has no key, naming no key', () => {
    expect(() =>
      loadConfig({
        DEEPSEEK_API_KEY: 'sk-x',
        LTW_AI_ROUTES: 'reasoning=anthropic:claude-opus-5-5,local',
      }),
    ).toThrow(/reasoning names anthropic, which has no key/);
  });

  it('allows exactly one remote and no local only in trusted evaluation mode', () => {
    const keyed = new Set(['anthropic', 'deepseek'] as const);
    expect(
      routeIssues(
        { reasoning: ['anthropic:claude-opus-5-5'], 'fast-context': ['deepseek:deepseek-flash'] },
        'evaluation',
        keyed,
      ),
    ).toEqual([]);
    for (const entries of [['local'], ['anthropic:claude-opus-5-5', 'local'], []]) {
      expect(routeIssues({ narrative: entries }, 'evaluation', keyed)).not.toEqual([]);
    }
    expect(routeIssues({ reasoning: ['anthropic:claude-opus-5-5'] }, 'runtime', keyed)).not.toEqual(
      [],
    );
  });

  it('has no dollar ceiling setting; the removed variable is reported, never parsed', () => {
    expect(loadConfig({ LTW_AI_DAILY_BUDGET_USD: '5' }).ai).not.toHaveProperty('dailyBudgetUsd');
    expect(obsoleteVariables({ LTW_AI_DAILY_BUDGET_USD: '5' })).toEqual([
      'LTW_AI_DAILY_BUDGET_USD',
    ]);
    expect(obsoleteVariables({})).toEqual([]);
  });
});
