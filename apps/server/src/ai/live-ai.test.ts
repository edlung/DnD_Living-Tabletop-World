import { intentRequest, type ProviderPayload } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig, obsoleteVariables } from '../platform/config/config.ts';
import { routeIssues } from '../platform/config/ai-routes.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { DEEPSEEK_CHAT_URL, createDeepSeekProvider } from './openai-compatible-provider.ts';

/**
 * Stage 300 (docs/adr/0032-live-ai.md): the DeepSeek adapter's wire format over injected `fetch`
 * (the shared raw adapter contract is `raw-adapters.test.ts`), and route validation. No network.
 * Composition routes a remote adapter only inside the admission wrapper (`gateway.test.ts`).
 */
const REQUEST: ProviderPayload = intentRequest(
  'Advance time by 1 hour.',
  { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
  null,
);
const KEY = 'sk-test-deepseek-never-shown';

describe('the OpenAI-compatible adapter', () => {
  it('prepares a forced function call with thinking off, from an allowlist', async () => {
    const fake = fakeFetch(() => jsonResponse({}));
    const deepseek = createDeepSeekProvider({
      apiKey: () => KEY,
      model: 'deepseek-flash',
      timeoutMs: 1_000,
      thinking: 'disabled',
      fetch: fake.fetchImpl,
    });
    const prepared = deepseek.prepare(REQUEST);

    // Identity and endpoint are pinned in trusted code, never configured (B2 stop-scope delta).
    expect(deepseek.id).toBe('deepseek');
    expect(prepared.provider).toBe('deepseek');
    expect(prepared.url).toBe(DEEPSEEK_CHAT_URL);
    expect(DEEPSEEK_CHAT_URL).toBe('https://api.deepseek.com/chat/completions');
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

describe('DeepSeek classification edge cases (B2, B1 Opus max finding 7)', () => {
  const reply = (choices: unknown[]) => ({
    id: 'chatcmpl-1',
    model: 'deepseek-flash',
    choices,
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  });
  const toolCall = {
    function: {
      name: 'propose_commands',
      arguments: JSON.stringify({ kind: 'decline', reason: 'not_game' }),
    },
  };
  const classify = async (body: unknown) => {
    const deepseek = createDeepSeekProvider({
      apiKey: () => KEY,
      model: 'deepseek-flash',
      timeoutMs: 1_000,
      thinking: 'disabled',
      fetch: fakeFetch(() => jsonResponse(body)).fetchImpl,
    });
    return deepseek.dispatch(
      deepseek.prepare(REQUEST),
      new AbortController().signal,
      () => undefined,
    );
  };

  it.each([
    ['a non-string refusal', { refusal: { reason: 'policy' }, tool_calls: null }],
    ['a refusal string next to a tool call', { refusal: 'No.', tool_calls: [toolCall] }],
  ])('treats %s as a refusal, never a repairable missing tool', async (_label, message) => {
    expect(await classify(reply([{ finish_reason: 'stop', message }]))).toMatchObject({
      kind: 'refusal',
    });
  });

  it('treats more than one choice as an unrequested billing option', async () => {
    const choice = { finish_reason: 'tool_calls', message: { tool_calls: [toolCall] } };
    expect(await classify(reply([choice, choice]))).toMatchObject({
      kind: 'suspect',
      code: 'UNVERIFIED_BILLING',
    });
  });

  it.each(['insufficient_system_resource', 'length', 'something_new'])(
    'treats a %s stop as truncation even with a complete tool call',
    async (finish) => {
      const response = await classify(
        reply([{ finish_reason: finish, message: { tool_calls: [toolCall] } }]),
      );
      expect(response).toMatchObject({ kind: 'malformed', code: 'TRUNCATED' });
      expect(response).not.toHaveProperty('output');
    },
  );

  it('still reads a complete tool call', async () => {
    expect(
      await classify(reply([{ finish_reason: 'tool_calls', message: { tool_calls: [toolCall] } }])),
    ).toMatchObject({ kind: 'output', output: { kind: 'decline', reason: 'not_game' } });
  });
});

describe('the .env.example routes (owner decision 3)', () => {
  it('name Sonnet 5.5 for every capability, in shapes runtime validation accepts', async () => {
    const { readFile } = await import('node:fs/promises');
    const example = await readFile(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const line = example.split('\n').find((text) => text.startsWith('# LTW_AI_ROUTES='));
    const routes = loadConfig({
      ANTHROPIC_API_KEY: KEY,
      LTW_AI_ROUTES: line?.slice('# LTW_AI_ROUTES='.length),
    }).ai.routes;
    expect(routes).toEqual({
      reasoning: ['anthropic:claude-sonnet-5-5', 'local'],
      'npc-dialogue': ['anthropic:claude-sonnet-5-5', 'local'],
      narrative: ['anthropic:claude-sonnet-5-5', 'local'],
      'fast-context': ['anthropic:claude-sonnet-5-5'],
    });
  });
});
