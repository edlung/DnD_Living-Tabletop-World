import { ProviderError, intentRequest, type AiProvider, type ProviderRequest } from '@ltw/ai';
import { InMemoryAiTraceStore } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../platform/config/config.ts';
import { SpendLedger, budgeted, costUsd } from './budget.ts';
import { createAiGateway } from './gateway.ts';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider.ts';

/** Stage 300 (docs/adr/0032-live-ai.md): the DeepSeek adapter, routes, and the spending ceiling. No network. */
const REQUEST: ProviderRequest = intentRequest(
  'Advance time by 1 hour.',
  { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
  null,
);
const KEY = 'sk-test-deepseek-never-shown';
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const call = (args: unknown, extra: object = {}) => ({
  model: 'deepseek-flash',
  choices: [
    {
      finish_reason: 'tool_calls',
      message: {
        tool_calls: [{ function: { name: 'propose_commands', arguments: JSON.stringify(args) } }],
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
  ...extra,
});
const provider = (fetchImpl: typeof fetch) =>
  createOpenAiCompatibleProvider({
    id: 'deepseek',
    baseUrl: 'https://example.test',
    apiKey: () => KEY,
    model: 'deepseek-flash',
    timeoutMs: 1_000,
    extraBody: { thinking: { type: 'disabled' } },
    fetch: fetchImpl,
  });

describe('the OpenAI-compatible adapter', () => {
  it('sends a forced function call with thinking off, and returns the arguments and usage', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fetchImpl = ((url: string, init: RequestInit) => {
      sent = {
        url,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
        auth: (init.headers as Record<string, string>)['authorization'] ?? '',
      };
      return reply(call({ summary: 'ok', commands: [] }));
    }) as unknown as typeof fetch;
    const out = await provider(fetchImpl).generate(REQUEST);
    expect(out).toEqual({
      output: { summary: 'ok', commands: [] },
      model: 'deepseek-flash',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(sent).toMatchObject({
      url: 'https://example.test/chat/completions',
      auth: `Bearer ${KEY}`,
    });
    expect(sent!.body).toMatchObject({
      thinking: { type: 'disabled' },
      tool_choice: { type: 'function', function: { name: 'propose_commands' } },
    });
    expect(JSON.stringify(sent!.body)).not.toContain(KEY);
  });

  it('maps failures to codes without echoing anything', async () => {
    const codes = async (fetchImpl: typeof fetch) =>
      provider(fetchImpl)
        .generate(REQUEST)
        .catch((error: ProviderError) => `${error.code}: ${error.message}`);
    expect(await codes((() => reply({}, 503)) as unknown as typeof fetch)).toBe(
      'UNAVAILABLE: provider responded 503',
    );
    expect(await codes((() => reply({}, 400)) as unknown as typeof fetch)).toBe(
      'BAD_RESPONSE: provider responded 400',
    );
    expect(
      await codes((() =>
        reply(
          call({}, { choices: [{ finish_reason: 'length', message: {} }] }),
        )) as unknown as typeof fetch),
    ).toBe('BAD_RESPONSE: provider output incomplete');
    expect(
      await codes((() =>
        reply({ choices: [{ message: { content: 'no tool' } }] })) as unknown as typeof fetch),
    ).toBe('BAD_RESPONSE: provider returned no structured output');
    expect(await codes((() => Promise.reject(new Error(KEY))) as unknown as typeof fetch)).toBe(
      'UNAVAILABLE: provider unreachable',
    );
  });
});

describe('the spending ledger', () => {
  it('prices a call from its model and refuses further calls once the ceiling is reached', async () => {
    expect(costUsd('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(24);
    const ledger = new SpendLedger(0.0001, () => '2026-10-05');
    let calls = 0;
    const inner: AiProvider = {
      id: 'deepseek',
      generate: () => {
        calls += 1;
        return Promise.resolve({
          output: {},
          model: 'deepseek-flash',
          usage: { inputTokens: 1_000, outputTokens: 1_000 },
        });
      },
    };
    const guarded = budgeted(inner, ledger);
    await guarded.generate(REQUEST);
    expect(ledger.exhausted).toBe(true);
    await expect(guarded.generate(REQUEST)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(calls).toBe(1);
  });

  it('starts a new day with a fresh allowance', () => {
    let day = '2026-10-05';
    const ledger = new SpendLedger(1, () => day);
    ledger.record('m', 2);
    expect(ledger.exhausted).toBe(true);
    day = '2026-10-06';
    expect(ledger.exhausted).toBe(false);
  });
});

describe('routes', () => {
  const env = {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    DEEPSEEK_API_KEY: 'sk-test',
    LTW_AI_ROUTES:
      'reasoning=anthropic:claude-opus-5-5,local;npc-dialogue=anthropic:claude-sonnet-5-5,deepseek:deepseek-flash,local;fast-context=deepseek:deepseek-flash',
  };
  const ids = (
    capability: Parameters<ReturnType<typeof createAiGateway>['router']['providersFor']>[0],
    e = env,
  ) =>
    createAiGateway(loadConfig(e).ai, new InMemoryAiTraceStore())
      .router.providersFor(capability)
      .map((p) => p.id);

  it('gives each capability its own list', () => {
    expect(ids('reasoning')).toEqual(['anthropic', 'local']);
    expect(ids('npc-dialogue')).toEqual(['anthropic', 'deepseek', 'local']);
    expect(ids('fast-context')).toEqual(['deepseek']);
    expect(ids('narrative')).toEqual(['anthropic', 'local']);
  });

  it('skips a provider whose key is missing, and rejects a malformed list', () => {
    expect(ids('npc-dialogue', { ...env, DEEPSEEK_API_KEY: '' })).toEqual(['anthropic', 'local']);
    expect(() => loadConfig({ LTW_AI_ROUTES: 'reasoning=openai:gpt' })).toThrow(ConfigError);
  });
});
