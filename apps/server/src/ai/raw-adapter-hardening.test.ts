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
import { createDeepSeekProvider } from './openai-compatible-provider.ts';
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
    : createDeepSeekProvider(openAiOptions(options));

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

/** Where the caller goes (or the hook fails), the code that proves or withholds release, starts. */
const SETUPS: readonly (readonly [string, (caller: AbortController) => Setup, string, number])[] = [
  [
    'while the key is read',
    (caller) => ({
      apiKey: () => {
        caller.abort();
        return KEY;
      },
      onStart: vi.fn(),
    }),
    'TRANSPORT_NOT_STARTED',
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
    'CALLER_CANCELLED',
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
    'UNAVAILABLE',
    1,
  ],
];

/**
 * Design §1 (B2 alignment of B1 Opus max finding 1): only a failure strictly before `onStart` is
 * TRANSPORT_NOT_STARTED. Once the hook has been called the attempt is post-dispatch uncertainty
 * (its hold stays), even though no transport is invoked.
 */
describe.each([ANTHROPIC, DEEPSEEK])('the raw $name adapter when the caller goes', (fixture) => {
  it.each(SETUPS)('invokes no transport %s, answering %s', async (_label, setup, code, starts) => {
    const caller = new AbortController();
    const { apiKey, onStart } = setup(caller);
    const fake = fakeFetch(() => new Response('{}'));
    const adapter = make(fixture, { fetch: fake.fetchImpl, apiKey });
    const prepared = adapter.prepare(REQUEST);
    const error = await failure(adapter.dispatch(prepared, caller.signal, onStart));

    expect(error.code).toBe(code);
    expect(error.message).not.toContain(KEY);
    expect(onStart).toHaveBeenCalledTimes(starts);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses to follow a redirect, so the key and body go nowhere else', async () => {
    const fake = fakeFetch(() => new Response('{}'));
    const adapter = make(fixture, { fetch: fake.fetchImpl, apiKey: () => KEY });
    await adapter
      .dispatch(adapter.prepare(REQUEST), new AbortController().signal, vi.fn())
      .catch(() => undefined);
    expect(fake.calls[0]?.init.redirect).toBe('error');
  });
});

/**
 * The whole-request deadline is also read from the monotonic clock (B2 repair 1): its abort signal
 * is set by a timer that can run late. Past the deadline, nothing is sent; strictly before the
 * start boundary that is TRANSPORT_NOT_STARTED, the live proof that releases an admitted hold.
 */
describe.each([ANTHROPIC, DEEPSEEK])('the raw $name adapter at its deadline', (fixture) => {
  const spinPast = (atMs: number) => {
    while (performance.now() <= atMs) {
      // Deliberately synchronous: no timer can fire.
    }
  };

  it('sends nothing and reads no key once the deadline has passed, signal live', async () => {
    const apiKey = vi.fn(() => KEY);
    const onStart = vi.fn();
    const fake = fakeFetch(() => new Response('{}'));
    const adapter = make(fixture, { fetch: fake.fetchImpl, apiKey });
    const error = await failure(
      adapter.dispatch(
        adapter.prepare(REQUEST),
        new AbortController().signal,
        onStart,
        performance.now() - 1,
      ),
    );
    expect(error.code).toBe('TRANSPORT_NOT_STARTED');
    expect(apiKey).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it('sends nothing when the deadline passes while the key is read', async () => {
    const deadlineAtMs = performance.now() + 10;
    const onStart = vi.fn();
    const fake = fakeFetch(() => new Response('{}'));
    const adapter = make(fixture, {
      fetch: fake.fetchImpl,
      apiKey: () => {
        spinPast(deadlineAtMs);
        return KEY;
      },
    });
    const error = await failure(
      adapter.dispatch(
        adapter.prepare(REQUEST),
        new AbortController().signal,
        onStart,
        deadlineAtMs,
      ),
    );
    expect(error.code).toBe('TRANSPORT_NOT_STARTED');
    expect(onStart).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it('bounds the attempt by the time left in the request', async () => {
    const fake = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const adapter = make(fixture, { fetch: fake.fetchImpl, apiKey: () => KEY, timeoutMs: 60_000 });
    const began = performance.now();
    const error = await failure(
      adapter.dispatch(
        adapter.prepare(REQUEST),
        new AbortController().signal,
        vi.fn(),
        performance.now() + 50,
      ),
    );
    expect(performance.now() - began).toBeLessThan(1_000);
    expect(error.code).toBe('CALLER_CANCELLED');
  });

  it('reports a timeout clamped to the request deadline as the caller’s, even if the clock lags', async () => {
    // Node timers can fire a little before `performance.now()` reaches their deadline; force that
    // race: from 20 ms on the clock reads 15 ms behind, so it has not reached the deadline when the
    // clamped attempt timer fires at 50 ms.
    const real = performance.now.bind(performance);
    let lag = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => real() - lag);
    setTimeout(() => {
      lag = 15;
    }, 20);
    try {
      const fake = fakeFetch(
        ({ init }) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );
      const adapter = make(fixture, {
        fetch: fake.fetchImpl,
        apiKey: () => KEY,
        timeoutMs: 60_000,
      });
      const error = await failure(
        adapter.dispatch(
          adapter.prepare(REQUEST),
          new AbortController().signal,
          vi.fn(),
          performance.now() + 50,
        ),
      );
      expect(error.code).toBe('CALLER_CANCELLED');
    } finally {
      clock.mockRestore();
    }
  });
});
