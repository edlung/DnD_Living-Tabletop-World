import type { ProviderResponse } from '@ltw/ai';
import { describe, expect, it, vi } from 'vitest';

import { fakeFetch } from '../testing/fake-fetch.ts';
import {
  ANTHROPIC,
  DEEPSEEK,
  KEY,
  NEVER,
  PROSE,
  REQUEST,
  anthropicOptions,
  failure,
  openAiOptions,
  type AdapterFixture,
  type MakeOptions,
} from '../testing/raw-adapter-fixtures.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider.ts';
import type { RawRemoteProvider } from './raw-provider.ts';

/**
 * Raw adapter hardening (docs/adr/0032-live-ai.md, B1 repair 1), both adapters, injected `fetch`:
 * usage allowlists match own field names only, so a field named like an inherited object property
 * fails closed as UNVERIFIED_BILLING with the safe facts kept; and a caller that goes away while
 * the key or the start hook runs gets no transport at all.
 */
const make = (fixture: AdapterFixture, options: MakeOptions): RawRemoteProvider =>
  fixture.name === 'Anthropic'
    ? createAnthropicProvider(anthropicOptions(options))
    : createOpenAiCompatibleProvider(openAiOptions(options));

const INHERITED = [
  '__proto__',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  '__defineGetter__',
];
const VALUES = ['null', '{}', '{"extra":7331}', '5'];

/** A response body whose usage block has `name` as an own field, written as raw JSON text. */
function bodyWithUsageField(fixture: AdapterFixture, usageJson: string): string {
  const marker = '"__USAGE_PLACEHOLDER__"';
  return JSON.stringify(fixture.reply({ usage: '__USAGE_PLACEHOLDER__' })).replace(
    marker,
    usageJson,
  );
}

async function classify(fixture: AdapterFixture, text: string): Promise<ProviderResponse> {
  const fake = fakeFetch(
    () => new Response(text, { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  const adapter = make(fixture, { fetch: fake.fetchImpl });
  return adapter.dispatch(adapter.prepare(REQUEST), NEVER, () => undefined);
}

describe.each([ANTHROPIC, DEEPSEEK])('the raw $name adapter on inherited-name usage', (fixture) => {
  const nested = fixture.name === 'Anthropic' ? 'cache_creation' : 'prompt_tokens_details';
  const cases = INHERITED.flatMap((name) => VALUES.map((value) => [name, value] as const));

  it.each(cases)('fails closed on an own usage field %s: %s', async (name, value) => {
    const usageJson = `${JSON.stringify(fixture.usage).slice(0, -1)},${JSON.stringify(name)}:${value}}`;
    expect(Object.hasOwn(JSON.parse(usageJson) as object, name)).toBe(true);
    const result = await classify(fixture, bodyWithUsageField(fixture, usageJson));

    expect(result).toMatchObject({
      kind: 'suspect',
      code: 'UNVERIFIED_BILLING',
      model: fixture.model,
      usage: fixture.tokens,
      providerRequestId: fixture.name === 'Anthropic' ? 'msg_01abc' : 'chatcmpl-1',
    });
    expect(result).not.toHaveProperty('output');
    const facts = result as Extract<ProviderResponse, { kind: 'suspect' }>;
    expect(facts.billing?.unrecognized).toContain(name);
    expect(JSON.stringify(result)).not.toContain('7331');
    expect(JSON.stringify(result)).not.toContain(PROSE);
  });

  it.each(INHERITED)('fails closed on an inherited name inside %s', async (name) => {
    const usageJson = JSON.stringify(fixture.usage).replace(
      `"${nested}":{`,
      `"${nested}":{${JSON.stringify(name)}:1,`,
    );
    expect(usageJson).toContain(`"${name}":1`);
    const result = await classify(fixture, bodyWithUsageField(fixture, usageJson));

    expect(result).toMatchObject({
      kind: 'suspect',
      code: 'UNVERIFIED_BILLING',
      usage: fixture.tokens,
    });
    const facts = result as Extract<ProviderResponse, { kind: 'suspect' }>;
    expect(facts.billing?.unrecognized).toContain(`${nested}.${name}`);
  });

  it('still keeps output for the allowlisted usage alone', async () => {
    const result = await classify(
      fixture,
      bodyWithUsageField(fixture, JSON.stringify(fixture.usage)),
    );
    expect(result).toMatchObject({ kind: 'output', billing: { unrecognized: [] } });
  });
});

interface Setup {
  readonly apiKey: () => string;
  readonly onStart: () => void;
}

const SETUPS: readonly (readonly [string, (caller: AbortController) => Setup, number])[] = [
  [
    'while the key is read',
    (caller) => ({
      apiKey: () => {
        caller.abort();
        return KEY;
      },
      onStart: vi.fn(),
    }),
    0,
  ],
  [
    'inside the start hook',
    (caller) => ({
      apiKey: () => KEY,
      onStart: vi.fn(() => {
        caller.abort();
      }),
    }),
    1,
  ],
  [
    'never, but the start hook throws',
    () => ({
      apiKey: () => KEY,
      onStart: vi.fn(() => {
        throw new Error('journal down');
      }),
    }),
    1,
  ],
];

describe.each([ANTHROPIC, DEEPSEEK])('the raw $name adapter when the caller goes', (fixture) => {
  it.each(SETUPS)(
    'invokes no transport %s: TRANSPORT_NOT_STARTED',
    async (_label, setup, starts) => {
      const caller = new AbortController();
      const { apiKey, onStart } = setup(caller);
      const fake = fakeFetch(() => new Response('{}'));
      const adapter = make(fixture, { fetch: fake.fetchImpl, apiKey });
      const prepared = adapter.prepare(REQUEST);
      const error = await failure(adapter.dispatch(prepared, caller.signal, onStart));

      expect(error.code).toBe('TRANSPORT_NOT_STARTED');
      expect(error.message).not.toContain(KEY);
      expect(onStart).toHaveBeenCalledTimes(starts);
      expect(fake.calls).toHaveLength(0);
    },
  );
});
