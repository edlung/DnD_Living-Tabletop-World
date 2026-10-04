import { ProviderError, intentRequest, type ProviderRequest } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  createAnthropicProvider,
} from './anthropic-provider.ts';

/** The Anthropic adapter against a fake `fetch`; tests never reach the network. */
const KEY = 'sk-ant-test-key-never-shown';
const REQUEST: ProviderRequest = intentRequest(
  'Advance time by 1 hour.',
  {
    scope: 'PUBLIC',
    items: [{ sourceId: 'north-gate', kind: 'entity', text: 'north-gate (location): North Gate' }],
    entities: [{ entityId: 'north-gate', kind: 'location', name: 'North Gate' }],
    worldTime: 0,
  },
  null,
);
const PROPOSAL = {
  summary: 'An hour passes.',
  commands: [{ type: 'AdvanceWorldTime', by: 3_600 }],
};

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(respond: (sent: Sent) => Response | Promise<Response>) {
  const calls: Sent[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    const sent = { url, init };
    calls.push(sent);
    return Promise.resolve(respond(sent));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const toolUse = (input: unknown, name = 'propose_commands') => ({
  model: 'claude-opus-5-5-20261001',
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: 'Here is the proposal.' },
    { type: 'tool_use', id: 'toolu_1', name, input },
  ],
  usage: { input_tokens: 812, output_tokens: 64 },
});

function provider(respond: (sent: Sent) => Response | Promise<Response>, timeoutMs = 1_000) {
  const fake = fakeFetch(respond);
  return {
    ...fake,
    provider: createAnthropicProvider({
      apiKey: () => KEY,
      model: 'claude-opus-5-5',
      timeoutMs,
      fetch: fake.fetchImpl,
    }),
  };
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error('expected a ProviderError');
}

describe('createAnthropicProvider', () => {
  it('sends a forced tool call with the structured output schema', async () => {
    const { calls, provider: anthropic } = provider(() => json(toolUse(PROPOSAL)));
    await anthropic.generate(REQUEST);

    const [call] = calls;
    expect(call?.url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      'x-api-key': KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    });
    const body = JSON.parse(call?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      system: REQUEST.system,
      messages: [{ role: 'user', content: REQUEST.prompt }],
      tools: [{ name: 'propose_commands', input_schema: REQUEST.output.schema }],
      tool_choice: { type: 'tool', name: 'propose_commands' },
    });
    expect(REQUEST.output.schema).not.toHaveProperty('$schema');
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('returns the tool input, the model, and token usage', async () => {
    const { provider: anthropic } = provider(() => json(toolUse(PROPOSAL)));

    expect(await anthropic.generate(REQUEST)).toEqual({
      output: PROPOSAL,
      model: 'claude-opus-5-5-20261001',
      usage: { inputTokens: 812, outputTokens: 64 },
    });
  });

  it('passes invalid structured output through for validation', async () => {
    const { provider: anthropic } = provider(() => json(toolUse({ nonsense: true })));

    expect((await anthropic.generate(REQUEST)).output).toEqual({ nonsense: true });
  });

  it.each([
    ['a 529 overload', () => json({ type: 'error' }, 529), 'UNAVAILABLE'],
    ['a 429 rate limit', () => json({ type: 'error' }, 429), 'UNAVAILABLE'],
    ['a 401 bad key', () => json({ type: 'error' }, 401), 'BAD_RESPONSE'],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 }), 'BAD_RESPONSE'],
    [
      'no tool call',
      () => json({ ...toolUse(PROPOSAL), content: [{ type: 'text', text: 'Hi' }] }),
      'BAD_RESPONSE',
    ],
    ['a different tool', () => json(toolUse(PROPOSAL, 'other_tool')), 'BAD_RESPONSE'],
    [
      'a truncated answer',
      () => json({ ...toolUse(PROPOSAL), stop_reason: 'max_tokens' }),
      'BAD_RESPONSE',
    ],
  ] as const)('reports %s as %s', async (_label, respond, code) => {
    const { provider: anthropic } = provider(respond);
    const error = await failure(anthropic.generate(REQUEST));

    expect(error.code).toBe(code);
    expect(error.message).not.toContain(KEY);
  });

  it('reports a network failure as UNAVAILABLE without its details', async () => {
    const { provider: anthropic } = provider(() => {
      throw new TypeError(`fetch failed for key ${KEY}`);
    });
    const error = await failure(anthropic.generate(REQUEST));

    expect(error.code).toBe('UNAVAILABLE');
    expect(error.message).toBe('provider unreachable');
  });

  it('aborts at the timeout and reports TIMEOUT', async () => {
    const { calls, provider: anthropic } = provider(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
      20,
    );
    const error = await failure(anthropic.generate(REQUEST));

    expect(error.code).toBe('TIMEOUT');
    expect(calls[0]?.init.signal?.aborted).toBe(true);
  });

  it('stops when the caller stops waiting, long before its own timeout (ADR 0021)', async () => {
    const { calls, provider: anthropic } = provider(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
      60_000,
    );
    const budget = new AbortController();
    setTimeout(() => {
      budget.abort();
    }, 20);
    const started = performance.now();
    const error = await failure(anthropic.generate({ ...REQUEST, signal: budget.signal }));

    expect(error.code).toBe('TIMEOUT');
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(calls[0]?.init.signal?.aborted).toBe(true);
    // The caller's signal is never sent anywhere: the body is the request's text alone.
    const body = calls[0]?.init.body;
    expect(typeof body).toBe('string');
    expect(typeof body === 'string' ? body : '').not.toContain('signal');
  });
});
