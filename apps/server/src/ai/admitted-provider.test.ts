import {
  ProviderError,
  failureCode,
  type AttemptContext,
  type ProviderRequest,
  type ProviderResponse,
} from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { FIXTURE_SONNET } from '../testing/catalog-fixtures.ts';
import { fakeBudgetStore, type FakeBudgetStore } from '../testing/fake-budget-store.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { ANTHROPIC, KEY, REQUEST } from '../testing/raw-adapter-fixtures.ts';
import { AccountingTasks } from './accounting-tasks.ts';
import type { AdmissionResult } from './accounting/types.ts';
import { admittedProvider, isAdmittedProvider } from './admitted-provider.ts';
import { createAnthropicProvider, type AnthropicOptions } from './anthropic-provider.ts';
import type { CatalogEntry } from './catalog.ts';
import { composeRouter } from './composition.ts';

/**
 * The admission wrapper (docs/STAGE_300_REMEDIATION_DESIGN.md §1–3; ADR 0032, B2), against a
 * scripted budget store and an injected `fetch`. Fixture prices only (`catalog-fixtures.ts`).
 * Reservation for the fixture body: the 20,000-token context at the highest input rate (1-hour
 * cache write above the tier, 12 µ$) = 240,000, plus 4,096 output tokens at 22.5 µ$ = 92,160.
 */
const RESERVE = 332_160n;
const MODEL = 'claude-sonnet-5-5';

interface Rig {
  readonly provider: ReturnType<typeof admittedProvider>;
  readonly store: FakeBudgetStore;
  readonly tasks: AccountingTasks;
  readonly events: string[];
  readonly fetched: () => number;
}

function rig(
  options: {
    readonly reply?: () => Response;
    readonly decide?: (request: { attemptId: string }) => AdmissionResult;
    readonly entry?: CatalogEntry;
    readonly adapter?: Partial<AnthropicOptions>;
  } = {},
): Rig {
  const events: string[] = [];
  const fake = fakeFetch(() => {
    events.push('fetch');
    return (options.reply ?? (() => jsonResponse(ANTHROPIC.reply({ model: MODEL }))))();
  });
  const store = fakeBudgetStore({
    onAdmit: () => events.push('admit'),
    ...(options.decide ? { decide: options.decide } : {}),
  });
  const tasks = new AccountingTasks();
  const raw = createAnthropicProvider({
    apiKey: () => {
      events.push('reveal');
      return KEY;
    },
    model: MODEL,
    acceptedModels: [MODEL, ...FIXTURE_SONNET.aliases],
    timeoutMs: 1_000,
    cache: '5m',
    fetch: fake.fetchImpl,
    ...options.adapter,
  });
  const provider = admittedProvider(raw, { store, entry: options.entry ?? FIXTURE_SONNET, tasks });
  return { provider, store, tasks, events, fetched: () => fake.calls.length };
}

const live = (overrides: Partial<AttemptContext> = {}): AttemptContext => ({
  signal: new AbortController().signal,
  deadlineAtMs: performance.now() + 10_000,
  onStart: () => undefined,
  ...overrides,
});

async function outcome(promise: Promise<ProviderResponse>) {
  try {
    return { response: await promise };
  } catch (error) {
    return { error: failureCode(error) };
  }
}

const kinds = (store: FakeBudgetStore) => store.calls.map((call) => call.kind);
const callOf = (store: FakeBudgetStore, kind: string) =>
  store.calls.find((call) => call.kind === kind);

describe('the admitted provider', () => {
  it('admits the exact prepared body before revealing the key, then settles priced usage', async () => {
    const { provider, store, tasks, events } = rig();
    const response = await provider.generate(REQUEST, live());
    await tasks.idle();

    expect(events).toEqual(['admit', 'reveal', 'fetch']);
    expect(store.calls[0]).toMatchObject({
      kind: 'admit',
      request: {
        requestId: REQUEST.accounting.requestId,
        attemptId: REQUEST.accounting.attemptId,
        attemptKind: 'initial',
        provider: 'anthropic',
        model: MODEL,
        pricingVersion: FIXTURE_SONNET.pricing.version,
        reserveMicros: RESERVE,
      },
    });
    // 812 input × 3 + 64 output × 15, at the first tier.
    expect(response).toMatchObject({
      kind: 'output',
      charge: {
        pricingVersion: 'fixture-anthropic-sonnet-2',
        reservedMicros: '332160',
        costMicros: '3396',
      },
    });
    expect(callOf(store, 'settle')).toMatchObject({
      kind: 'settle',
      input: { attemptId: REQUEST.accounting.attemptId, chargeMicros: 3396n, returnedModel: MODEL },
    });
  });

  it.each([
    ['BUDGET_DENIED', 'BUDGET_DENIED'],
    ['ADMISSION_DISABLED', 'ADMISSION_DISABLED'],
    ['ADMISSION_UNAVAILABLE', 'ADMISSION_UNAVAILABLE'],
    ['CALLER_CANCELLED', 'ADMISSION_UNAVAILABLE'],
  ] as const)('dispatches nothing when admission answers %s', async (code, answered) => {
    const { provider, events } = rig({
      decide: () => ({ status: 'denied', code, detail: 'STORAGE' }),
    });
    expect(await provider.generate(REQUEST, live())).toEqual({ kind: 'denied', code: answered });
    expect(events).toEqual(['admit']);
  });

  it.each([
    ['without a play session', { ...REQUEST.accounting, sessionId: null }],
    ['without a request ID', { ...REQUEST.accounting, requestId: 'not-a-uuid' }],
    ['with an unknown attempt kind', { ...REQUEST.accounting, attemptKind: 'switch' }],
  ])('refuses to account for a request %s, before admission', async (_label, accounting) => {
    const { provider, events } = rig();
    const request = { ...REQUEST, accounting } as unknown as ProviderRequest;
    expect(await provider.generate(request, live())).toEqual({
      kind: 'denied',
      code: 'ADMISSION_DISABLED',
    });
    expect(events).toEqual([]);
  });

  it('refuses an unbounded request before admission', async () => {
    const { provider, events } = rig();
    expect(
      await provider.generate(REQUEST, live({ deadlineAtMs: Number.POSITIVE_INFINITY })),
    ).toEqual({ kind: 'denied', code: 'ADMISSION_UNAVAILABLE' });
    expect(events).toEqual([]);
  });

  it.each([
    ['a request option value outside the allowlist', { adapter: { effort: 'high' as const } }],
    [
      'an unpriced request field',
      {
        adapter: { effort: 'low' as const },
        entry: {
          ...FIXTURE_SONNET,
          request: {
            ...FIXTURE_SONNET.request,
            fields: FIXTURE_SONNET.request.fields.filter((field) => field !== 'output_config'),
          },
        },
      },
    ],
    [
      'a body over the size limit',
      { entry: { ...FIXTURE_SONNET, limits: { ...FIXTURE_SONNET.limits, maxRequestBytes: 100 } } },
    ],
    ['a cache breakpoint the entry does not allow', { entry: { ...FIXTURE_SONNET, cache: null } }],
    [
      'max_tokens over the entry bound',
      {
        entry: { ...FIXTURE_SONNET, limits: { ...FIXTURE_SONNET.limits, maxOutputTokens: 1_000 } },
      },
    ],
  ])('denies %s before admission, revealing nothing', async (_label, options) => {
    const { provider, events } = rig(options);
    expect(await provider.generate(REQUEST, live())).toEqual({
      kind: 'denied',
      code: 'ADMISSION_DISABLED',
    });
    expect(events).toEqual([]);
  });

  it('releases a hold only with live proof that transport never started', async () => {
    const caller = new AbortController();
    const admitting = rig({
      decide: (request) => {
        caller.abort();
        return {
          status: 'admitted',
          attemptId: request.attemptId,
          billingDay: 'd',
          reservedMicros: 1n,
        };
      },
    });
    const gone = await outcome(
      admitting.provider.generate(REQUEST, live({ signal: caller.signal })),
    );
    await admitting.tasks.idle();
    expect(gone).toEqual({ error: 'TRANSPORT_NOT_STARTED' });
    expect(kinds(admitting.store)).toEqual(['admit', 'release']);
    expect(admitting.events).toEqual(['admit']);

    // A key that cannot be read fails strictly before the start boundary: released too.
    const unreadable = rig({
      adapter: {
        apiKey: () => {
          throw new Error(KEY);
        },
      },
    });
    expect(await outcome(unreadable.provider.generate(REQUEST, live()))).toEqual({
      error: 'TRANSPORT_NOT_STARTED',
    });
    await unreadable.tasks.idle();
    expect(kinds(unreadable.store)).toEqual(['admit', 'release']);
  });

  it.each([
    [
      'a network failure after the start',
      () => {
        throw new TypeError('down');
      },
      'UNAVAILABLE',
    ],
    ['a 500 after the start', () => jsonResponse({}, 500), 'UNAVAILABLE'],
  ])('keeps the full hold for %s', async (_label, reply, code) => {
    const { provider, store, tasks } = rig({ reply });
    expect(await outcome(provider.generate(REQUEST, live()))).toEqual({ error: code });
    await tasks.idle();
    expect(kinds(store)).toEqual(['admit']);
  });

  it('keeps the hold when the caller goes inside the start hook (after the boundary)', async () => {
    const caller = new AbortController();
    const { provider, store, tasks, events } = rig();
    const result = await outcome(
      provider.generate(
        REQUEST,
        live({
          signal: caller.signal,
          onStart: () => {
            caller.abort();
          },
        }),
      ),
    );
    await tasks.idle();
    expect(result).toEqual({ error: 'CALLER_CANCELLED' });
    expect(kinds(store)).toEqual(['admit']);
    expect(events).toEqual(['admit', 'reveal']);
  });

  it('A1: a throwing start listener neither stops the paid call nor its settlement', async () => {
    const { provider, store, tasks, events } = rig();
    const response = await provider.generate(
      REQUEST,
      live({
        onStart: () => {
          throw new Error('listener');
        },
      }),
    );
    await tasks.idle();
    expect(events).toEqual(['admit', 'reveal', 'fetch']);
    expect(response.kind).toBe('output');
    expect(kinds(store)).toEqual(['admit', 'response', 'settle']);
  });

  it('holds and stops an unexpected model at its canonical identity, discarding output', async () => {
    const { provider, store, tasks } = rig({
      reply: () => jsonResponse(ANTHROPIC.reply({ model: 'claude-cheaper-model' })),
    });
    const response = await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(response).toMatchObject({ kind: 'suspect', code: 'UNEXPECTED_MODEL' });
    expect(response).not.toHaveProperty('output');
    expect(callOf(store, 'hold')).toEqual({
      kind: 'hold',
      attemptId: REQUEST.accounting.attemptId,
      reason: 'UNEXPECTED_MODEL',
      returnedModel: 'claude-cheaper-model',
    });
  });

  it('accepts a verified alias as the same model', async () => {
    const { provider, tasks, store } = rig({
      reply: () => jsonResponse(ANTHROPIC.reply({ model: 'claude-sonnet-5-5-fixture-snapshot' })),
    });
    expect((await provider.generate(REQUEST, live())).kind).toBe('output');
    await tasks.idle();
    expect(kinds(store)).toEqual(['admit', 'response', 'settle']);
  });

  it.each([
    [
      'an unknown usage field',
      { ...ANTHROPIC.usage, server_tool_use: { web_search_requests: 1 } },
      FIXTURE_SONNET,
    ],
    [
      'a dimension the entry does not price',
      ANTHROPIC.usage,
      {
        ...FIXTURE_SONNET,
        usage: { ...FIXTURE_SONNET.usage, dimensions: ['input_tokens', 'output_tokens'] },
      },
    ],
    [
      'inconsistent cache-write totals',
      {
        ...ANTHROPIC.usage,
        cache_creation_input_tokens: 5,
        cache_creation: { ephemeral_5m_input_tokens: 1, ephemeral_1h_input_tokens: 1 },
      },
      FIXTURE_SONNET,
    ],
  ])('treats %s as unverified billing: hold, stop, no output', async (_label, usage, entry) => {
    const { provider, store, tasks } = rig({
      entry,
      reply: () => jsonResponse(ANTHROPIC.reply({ model: MODEL, usage })),
    });
    const response = await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(response).toMatchObject({ kind: 'suspect', code: 'UNVERIFIED_BILLING' });
    expect(response).not.toHaveProperty('output');
    expect(store.calls.map((call) => (call.kind === 'hold' ? call.reason : call.kind))).toEqual([
      'admit',
      'response',
      'UNVERIFIED_BILLING',
    ]);
  });

  it('keeps output but the whole hold when usage is absent', async () => {
    const { provider, store, tasks } = rig({
      reply: () => {
        const reply = ANTHROPIC.reply({ model: MODEL });
        return jsonResponse(
          Object.fromEntries(Object.entries(reply).filter(([k]) => k !== 'usage')),
        );
      },
    });
    const response = await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(response).toMatchObject({ kind: 'output', charge: { costMicros: null } });
    expect(kinds(store)).toEqual(['admit', 'response']);
  });

  it.each([
    ['above the context tier', { input_tokens: 12_000, output_tokens: 64 }, 12_000n * 6n + 1_440n],
    [
      'with 1-hour cache writes',
      {
        input_tokens: 100,
        output_tokens: 10,
        cache_creation: { ephemeral_1h_input_tokens: 1_000 },
      },
      300n + 150n + 6_000n,
    ],
    [
      'with cache writes reported only as a total (priced as 1-hour)',
      { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 1_000 },
      300n + 150n + 6_000n,
    ],
    [
      'with 5-minute writes and reads',
      {
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 1_000,
        cache_creation: { ephemeral_5m_input_tokens: 400 },
      },
      300n + 150n + 300n + 1_500n,
    ],
  ])('settles usage %s at the tier its actual input implies', async (_label, usage, micros) => {
    const { provider, store, tasks } = rig({
      reply: () => jsonResponse(ANTHROPIC.reply({ model: MODEL, usage })),
    });
    await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(callOf(store, 'settle')).toMatchObject({
      kind: 'settle',
      input: { chargeMicros: micros },
    });
  });

  it('admits repairs and switches as their own attempt kinds', async () => {
    for (const [attemptKind, admitted] of [
      ['repair', 'repair'],
      ['fallback', 'switch'],
    ] as const) {
      const { provider, store } = rig();
      await provider.generate(
        { ...REQUEST, accounting: { ...REQUEST.accounting, attemptKind } },
        live(),
      );
      expect(store.calls[0]).toMatchObject({ request: { attemptKind: admitted } });
    }
  });

  it('is a frozen, registered remote provider that composition accepts', () => {
    const { provider } = rig();
    expect(isAdmittedProvider(provider)).toBe(true);
    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(provider, 'kind')).toMatchObject({
      value: 'remote',
      writable: false,
    });
    expect(composeRouter({ reasoning: [provider] }).providersFor('reasoning')).toEqual([provider]);
    expect(isAdmittedProvider({ ...provider })).toBe(false);
    expect(() => new ProviderError('UNAVAILABLE', 'x')).not.toThrow();
  });
});
