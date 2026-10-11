import type { ProviderResponse } from '@ltw/ai';
import { describe, expect, it, vi } from 'vitest';

import { fakeFetch, hanging, jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import {
  ANTHROPIC,
  DEEPSEEK,
  KEY,
  NEVER as never,
  OUTPUT,
  PROSE,
  REQUEST,
  anthropicOptions,
  failure,
  openAiOptions,
  type AdapterFixture,
  type MakeOptions,
} from '../testing/raw-adapter-fixtures.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { createDeepSeekProvider } from './openai-compatible-provider.ts';
import type { RawRemoteProvider } from './raw-provider.ts';

/**
 * The raw remote adapter contract, for both adapters (docs/adr/0032-live-ai.md, checkpoint B1):
 * `prepare` builds the whole body with no transport and no key; `dispatch` sends exactly that body,
 * signals the start synchronously just before `fetch`, proves TRANSPORT_NOT_STARTED only before
 * it, and classifies responses keeping safe usage/model/request IDs. Injected `fetch` only.
 */
type Subject = AdapterFixture & { readonly make: (options: MakeOptions) => RawRemoteProvider };
const subjectOf = (fixture: AdapterFixture): Subject => ({
  ...fixture,
  make: (options) =>
    fixture.name === 'Anthropic'
      ? createAnthropicProvider(anthropicOptions(options))
      : createDeepSeekProvider(openAiOptions(options)),
});

describe.each([subjectOf(ANTHROPIC), subjectOf(DEEPSEEK)])('the raw $name adapter', (subject) => {
  /** Dispatches REQUEST against `respond`, recording whether the start came first. */
  async function dispatch(
    respond: (call: FetchCall) => Response | Promise<Response>,
    options: { acceptedModels?: readonly string[] } = {},
  ) {
    let started = 0;
    const fake = fakeFetch((call) => {
      expect(started, 'onStart ran before fetch').toBe(1);
      return respond(call);
    });
    const adapter = subject.make({ fetch: fake.fetchImpl, ...options });
    const result = await adapter.dispatch(adapter.prepare(REQUEST), never, () => {
      started += 1;
    });
    return { result, calls: fake.calls };
  }

  it('prepares the whole body with no transport and no key, then sends it byte for byte', async () => {
    const apiKey = vi.fn(() => KEY);
    const fake = fakeFetch(() => jsonResponse(subject.reply()));
    const adapter = subject.make({ fetch: fake.fetchImpl, apiKey });
    const prepared = adapter.prepare(REQUEST);

    expect(fake.calls).toHaveLength(0);
    expect(apiKey).not.toHaveBeenCalled();
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(prepared).toMatchObject({ model: subject.model, toolName: 'propose_commands' });
    const body = JSON.parse(prepared.body) as Record<string, unknown>;
    expect(prepared.body).toContain(JSON.stringify(REQUEST.system).slice(1, -1));
    expect(prepared.body).toContain(JSON.stringify(REQUEST.prompt).slice(1, -1));
    expect(subject.schemaOf(body)).toEqual(REQUEST.output.schema);
    expect(prepared.body).not.toContain(KEY);
    // Trusted accounting metadata is never serialized (design §2).
    const { requestId, campaignId, sessionId, attemptId } = REQUEST.accounting;
    for (const value of [requestId, campaignId, sessionId ?? '', attemptId]) {
      expect(prepared.body).not.toContain(value);
    }

    await adapter.dispatch(prepared, never, () => undefined);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.body).toBe(prepared.body);
    expect(fake.calls[0]?.url).toBe(prepared.url);
    expect(apiKey).toHaveBeenCalledTimes(1);
  });

  it('sends the intent envelope as one top-level object with a kind discriminator', () => {
    const adapter = subject.make({ fetch: fakeFetch(() => jsonResponse({})).fetchImpl });
    const body = JSON.parse(adapter.prepare(REQUEST).body) as Record<string, unknown>;
    const schema = subject.schemaOf(body) as Record<string, unknown>;
    expect(schema).toMatchObject({ type: 'object', required: ['kind'] });
    expect(schema).not.toHaveProperty('oneOf');
    expect(Object.keys(schema['properties'] as object)).toEqual(['kind', 'proposal', 'reason']);
  });

  it.each([
    ['a copy of a prepared request', (prepared: object) => ({ ...prepared })],
    ['a request another adapter prepared', () => null],
  ])('refuses %s before any start', async (_label, forge) => {
    const fake = fakeFetch(() => jsonResponse(subject.reply()));
    const adapter = subject.make({ fetch: fake.fetchImpl });
    const other = subject.make({ fetch: fake.fetchImpl });
    const prepared = adapter.prepare(REQUEST);
    const forged = (forge(prepared) ?? other.prepare(REQUEST)) as typeof prepared;
    const onStart = vi.fn();

    expect((await failure(adapter.dispatch(forged, never, onStart))).code).toBe(
      'TRANSPORT_NOT_STARTED',
    );
    expect(onStart).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    [
      'an already aborted caller',
      () => {
        const gone = new AbortController();
        gone.abort();
        return { signal: gone.signal, apiKey: () => KEY, onStart: () => undefined };
      },
    ],
    [
      'a key that cannot be read',
      () => ({
        signal: never,
        apiKey: () => {
          throw new Error(`no key ${KEY}`);
        },
        onStart: () => undefined,
      }),
    ],
  ])('proves TRANSPORT_NOT_STARTED for %s, with no fetch', async (_label, setup) => {
    const { signal, apiKey, onStart } = setup();
    const fake = fakeFetch(() => jsonResponse(subject.reply()));
    const adapter = subject.make({ fetch: fake.fetchImpl, apiKey });
    const error = await failure(adapter.dispatch(adapter.prepare(REQUEST), signal, onStart));

    expect(error.code).toBe('TRANSPORT_NOT_STARTED');
    expect(error.message).not.toContain(KEY);
    expect(error.cause).toBeUndefined();
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    [
      'a network failure',
      () => {
        throw new TypeError(`fetch failed for ${KEY}`);
      },
      'UNAVAILABLE',
    ],
    ['a 503', () => jsonResponse({ error: KEY }, 503), 'UNAVAILABLE'],
    ['a 429', () => jsonResponse({ error: KEY }, 429), 'UNAVAILABLE'],
    ['a 400', () => jsonResponse({ error: KEY }, 400), 'BAD_RESPONSE'],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 }), 'BAD_RESPONSE'],
    ['a JSON array', () => jsonResponse([1, 2]), 'BAD_RESPONSE'],
  ] as const)('reports %s after the start as %s, echoing nothing', async (_l, respond, code) => {
    let started = false;
    const fake = fakeFetch(respond);
    const adapter = subject.make({ fetch: fake.fetchImpl });
    const error = await failure(
      adapter.dispatch(adapter.prepare(REQUEST), never, () => {
        started = true;
      }),
    );

    expect(started).toBe(true);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(KEY);
    expect(error.cause).toBeUndefined();
  });

  it('separates its own timeout from the caller going away, and the caller wins a tie', async () => {
    const timed = subject.make({ fetch: fakeFetch(hanging).fetchImpl, timeoutMs: 20 });
    expect(
      (await failure(timed.dispatch(timed.prepare(REQUEST), never, () => undefined))).code,
    ).toBe('TIMEOUT');

    for (const timeoutMs of [60_000, 20]) {
      const caller = new AbortController();
      const fake = fakeFetch(hanging);
      const adapter = subject.make({ fetch: fake.fetchImpl, timeoutMs });
      setTimeout(() => {
        caller.abort();
      }, 20);
      const error = await failure(
        adapter.dispatch(adapter.prepare(REQUEST), caller.signal, () => undefined),
      );
      expect(error.code).toBe('CALLER_CANCELLED');
      expect(fake.calls[0]?.init.signal?.aborted).toBe(true);
    }
  });

  it('returns the output with model, usage, billing facts and the request ID', async () => {
    const { result } = await dispatch(() => jsonResponse(subject.reply()));

    expect(result).toMatchObject({
      kind: 'output',
      output: OUTPUT,
      model: subject.model,
      usage: subject.tokens,
      providerRequestId: expect.stringMatching(/^(msg_01abc|chatcmpl-1)$/) as string,
      billing: { unrecognized: [] },
    });
    expect(JSON.stringify(result)).not.toContain(PROSE);
  });

  it.each([
    ['a refusal', { stop: 'refusal' }, { kind: 'refusal' }],
    ['truncation', { stop: 'truncated' }, { kind: 'malformed', code: 'TRUNCATED' }],
    ['no tool call', { tool: null }, { kind: 'malformed', code: 'MISSING_TOOL' }],
    ['another tool', { tool: 'other_tool' }, { kind: 'malformed', code: 'MISSING_TOOL' }],
  ] as const)(
    'keeps usage and model on %s, without provider prose',
    async (_l, reply, expected) => {
      const { result } = await dispatch(() => jsonResponse(subject.reply(reply)));

      expect(result).toMatchObject({ ...expected, model: subject.model, usage: subject.tokens });
      expect(result).not.toHaveProperty('output');
      expect(JSON.stringify(result)).not.toContain(PROSE);
    },
  );

  it('passes schema-invalid structured output through for validation', async () => {
    const { result } = await dispatch(() =>
      jsonResponse(subject.reply({ output: { nonsense: true } })),
    );
    expect(result).toMatchObject({ kind: 'output', output: { nonsense: true } });
  });

  it.each([
    ['another model', { model: 'cheaper-model-9' }],
    ['a dated version not mapped', { model: `${subject.model}-20261001` }],
    ['no model', { model: '' }],
  ])('discards the output of %s as UNEXPECTED_MODEL', async (_l, reply) => {
    const { result } = await dispatch(() => jsonResponse(subject.reply(reply)));

    expect(result).toMatchObject({
      kind: 'suspect',
      code: 'UNEXPECTED_MODEL',
      usage: subject.tokens,
    });
    expect(result).not.toHaveProperty('output');
  });

  it('accepts a returned version only through an explicit mapping', async () => {
    const dated = `${subject.model}-20261001`;
    const { result } = await dispatch(() => jsonResponse(subject.reply({ model: dated })), {
      acceptedModels: [subject.model, dated],
    });
    expect(result).toMatchObject({ kind: 'output', model: dated });
  });

  it.each([
    [
      'an unknown usage field',
      { ...subject.usage, server_tool_use: { web_search_requests: 1 } },
      'server_tool_use',
    ],
    [
      'a negative count',
      { ...subject.usage, [subject.name === 'Anthropic' ? 'input_tokens' : 'prompt_tokens']: -1 },
      null,
    ],
    [
      'a fractional count',
      {
        ...subject.usage,
        [subject.name === 'Anthropic' ? 'output_tokens' : 'completion_tokens']: 1.5,
      },
      null,
    ],
    [
      'a count as text',
      {
        ...subject.usage,
        [subject.name === 'Anthropic' ? 'output_tokens' : 'completion_tokens']: '20',
      },
      null,
    ],
    ['an unexpected tier', { ...subject.usage, service_tier: 'priority' }, 'service_tier'],
    [
      'an unknown nested count',
      { ...subject.usage, prompt_tokens_details: { audio_tokens: 3 } },
      null,
    ],
  ])('treats %s as UNVERIFIED_BILLING, naming but never valuing it', async (_l, usage, name) => {
    const { result } = await dispatch(() => jsonResponse(subject.reply({ usage })));

    expect(result).toMatchObject({ kind: 'suspect', code: 'UNVERIFIED_BILLING' });
    expect(result).not.toHaveProperty('output');
    const facts = result as Extract<ProviderResponse, { kind: 'suspect' }>;
    expect(facts.billing?.unrecognized.length).toBeGreaterThan(0);
    if (name !== null) expect(facts.billing?.unrecognized).toContain(name);
    expect(JSON.stringify(facts.billing)).not.toMatch(/priority|"20"|web_search_requests":1/);
  });

  it('keeps output with unknown usage when the provider sent none', async () => {
    const { result } = await dispatch(() => jsonResponse(subject.reply({ usage: null })));
    expect(result).toMatchObject({ kind: 'output', usage: null, billing: null });
  });
});

describe('the raw OpenAI-compatible adapter on unreadable arguments', () => {
  it('reports INVALID_JSON as malformed output, keeping usage', async () => {
    const fake = fakeFetch(() => jsonResponse(DEEPSEEK.reply({ rawArguments: '{"kind": "pro' })));
    const adapter = subjectOf(DEEPSEEK).make({ fetch: fake.fetchImpl });
    const result = await adapter.dispatch(adapter.prepare(REQUEST), never, () => undefined);

    expect(result).toMatchObject({
      kind: 'malformed',
      code: 'INVALID_JSON',
      usage: DEEPSEEK.tokens,
    });
  });
});
