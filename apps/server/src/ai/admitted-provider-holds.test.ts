import { failureCode, type AttemptContext, type ProviderResponse } from '@ltw/ai';
import { describe, expect, it, vi } from 'vitest';

import { FIXTURE_SONNET } from '../testing/catalog-fixtures.ts';
import { fakeBudgetStore, type FakeBudgetStore } from '../testing/fake-budget-store.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { ANTHROPIC, KEY, REQUEST } from '../testing/raw-adapter-fixtures.ts';
import { AccountingTasks, type AccountingIssue } from './accounting-tasks.ts';
import { StorageUnavailable } from './accounting/pg-transaction.ts';
import type { AdmissionResult } from './accounting/types.ts';
import { admittedProvider } from './admitted-provider.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import type { CatalogEntry } from './catalog.ts';

/**
 * Holds and records around an admitted attempt (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2;
 * ADR 0032, B2 repair 1): the whole-request deadline is read from the monotonic clock, not only
 * from its abort signal; a suspect route's stop write is retried and the route refused in-process
 * until it commits; a provider request ID is recorded for every attempt that has one.
 */
const MODEL = 'claude-sonnet-5-5';
const OTHER: CatalogEntry = { ...FIXTURE_SONNET, model: 'claude-other-fixture', aliases: [] };

/** Busy-waits past `atMs`: no timer can fire meanwhile, so a deadline timer cannot have run. */
function spinPast(atMs: number): void {
  while (performance.now() <= atMs) {
    // Deliberately synchronous.
  }
}

interface Setup {
  readonly reply?: () => Response;
  readonly decide?: () => AdmissionResult;
  readonly apiKey?: () => string;
  readonly holdWithStop?: () => Promise<void>;
  readonly store?: FakeBudgetStore;
  readonly tasks?: AccountingTasks;
  readonly entry?: CatalogEntry;
}

function rig(setup: Setup = {}) {
  const events: string[] = [];
  const fake = fakeFetch(() => {
    events.push('fetch');
    return (setup.reply ?? (() => jsonResponse(ANTHROPIC.reply({ model: MODEL }))))();
  });
  const store =
    setup.store ??
    fakeBudgetStore({
      onAdmit: () => events.push('admit'),
      ...(setup.decide ? { decide: setup.decide } : {}),
      ...(setup.holdWithStop ? { holdWithStop: setup.holdWithStop } : {}),
    });
  const tasks = setup.tasks ?? new AccountingTasks();
  const entry = setup.entry ?? FIXTURE_SONNET;
  const raw = createAnthropicProvider({
    apiKey:
      setup.apiKey ??
      (() => {
        events.push('reveal');
        return KEY;
      }),
    model: entry.model,
    acceptedModels: [entry.model, ...entry.aliases],
    timeoutMs: 1_000,
    cache: '5m',
    fetch: fake.fetchImpl,
  });
  return { provider: admittedProvider(raw, { store, entry, tasks }), store, tasks, events };
}

const live = (overrides: Partial<AttemptContext> = {}): AttemptContext => ({
  // Never aborted: only the monotonic deadline can say the caller has gone.
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
const admitted = (): AdmissionResult => ({
  status: 'admitted',
  attemptId: REQUEST.accounting.attemptId,
  billingDay: '2026-10-11',
  reservedMicros: 1n,
});

describe('the deadline, read from the monotonic clock', () => {
  it('never dispatches an admission that commits after the deadline, and releases it live', async () => {
    const deadlineAtMs = performance.now() + 15;
    const onStart = vi.fn();
    const { provider, store, tasks, events } = rig({
      decide: () => {
        spinPast(deadlineAtMs);
        return admitted();
      },
    });
    const result = await outcome(provider.generate(REQUEST, live({ deadlineAtMs, onStart })));
    await tasks.idle();
    expect(result).toEqual({ error: 'TRANSPORT_NOT_STARTED' });
    expect(events).toEqual(['admit']);
    expect(onStart).not.toHaveBeenCalled();
    expect(kinds(store)).toEqual(['admit', 'release']);
  });

  it('asks no admission once the deadline has passed', async () => {
    const { provider, store, events } = rig();
    const result = await outcome(
      provider.generate(REQUEST, live({ deadlineAtMs: performance.now() - 1 })),
    );
    expect(result).toEqual({ error: 'TRANSPORT_NOT_STARTED' });
    expect(kinds(store)).toEqual([]);
    expect(events).toEqual([]);
  });

  it('releases live when the deadline passes while the key is read, before the boundary', async () => {
    const deadlineAtMs = performance.now() + 15;
    const onStart = vi.fn();
    const { provider, store, tasks, events } = rig({
      apiKey: () => {
        spinPast(deadlineAtMs);
        return KEY;
      },
    });
    const result = await outcome(provider.generate(REQUEST, live({ deadlineAtMs, onStart })));
    await tasks.idle();
    expect(result).toEqual({ error: 'TRANSPORT_NOT_STARTED' });
    expect(events).toEqual(['admit']);
    expect(onStart).not.toHaveBeenCalled();
    expect(kinds(store)).toEqual(['admit', 'release']);
  });
});

describe('the automatic stop of a suspect response', () => {
  const suspectReply = () => jsonResponse(ANTHROPIC.reply({ model: 'claude-cheaper-model' }));

  it('retries the stop write and refuses the route in this process until it commits', async () => {
    let failures = 2;
    const slept: number[] = [];
    const tasks = new AccountingTasks(undefined, {
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    const { provider, store } = rig({
      tasks,
      reply: suspectReply,
      holdWithStop: () =>
        failures-- > 0 ? Promise.reject(new StorageUnavailable('timeout')) : Promise.resolve(),
    });
    expect((await provider.generate(REQUEST, live())).kind).toBe('suspect');
    // Before the stop commits, the same route is refused here without asking admission.
    expect(await provider.generate(REQUEST, live())).toEqual({
      kind: 'denied',
      code: 'ADMISSION_DISABLED',
    });
    await tasks.idle();
    expect(slept).toEqual([100, 500]);
    expect(kinds(store)).toEqual(['admit', 'response', 'hold', 'hold', 'hold']);
    // Committed: admission (and its stored stop) decides again.
    await provider.generate(REQUEST, live());
    expect(kinds(store).filter((kind) => kind === 'admit')).toHaveLength(2);
  });

  it('keeps refusing the route and reports it when every retry fails', async () => {
    const issues: AccountingIssue[] = [];
    const tasks = new AccountingTasks((issue) => issues.push(issue), {
      sleep: () => Promise.resolve(),
    });
    const { provider, store } = rig({
      tasks,
      reply: suspectReply,
      holdWithStop: () => Promise.reject(new StorageUnavailable('timeout')),
    });
    await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(kinds(store).filter((kind) => kind === 'hold')).toHaveLength(4);
    expect(issues).toContain('STOP_FAILED');
    expect(await provider.generate(REQUEST, live())).toEqual({
      kind: 'denied',
      code: 'ADMISSION_DISABLED',
    });
    expect(kinds(store).filter((kind) => kind === 'admit')).toHaveLength(1);
  });

  it('refuses in-process with the stop’s own scope: model for a model, provider for billing', async () => {
    for (const [reply, otherRefused] of [
      [suspectReply, false],
      [
        () =>
          jsonResponse(
            ANTHROPIC.reply({
              model: MODEL,
              usage: { ...ANTHROPIC.usage, server_tool_use: { web_search_requests: 1 } },
            }),
          ),
        true,
      ],
    ] as const) {
      let commit: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => {
        commit = resolve;
      });
      const store = fakeBudgetStore({ holdWithStop: () => pending });
      const tasks = new AccountingTasks();
      const sonnet = rig({ store, tasks, reply });
      const other = rig({ store, tasks, entry: OTHER });
      expect((await sonnet.provider.generate(REQUEST, live())).kind).toBe('suspect');
      const answer = await other.provider.generate(REQUEST, live());
      expect(answer.kind === 'denied').toBe(otherRefused);
      commit();
      await tasks.idle();
    }
  });
});

describe('provider request IDs', () => {
  it.each([
    ['settled usage', () => jsonResponse(ANTHROPIC.reply({ model: MODEL })), MODEL],
    [
      'absent usage',
      () =>
        jsonResponse(
          Object.fromEntries(
            Object.entries(ANTHROPIC.reply({ model: MODEL })).filter(([key]) => key !== 'usage'),
          ),
        ),
      MODEL,
    ],
    [
      'an unexpected model',
      () => jsonResponse(ANTHROPIC.reply({ model: 'claude-cheaper-model' })),
      'claude-cheaper-model',
    ],
    [
      'unverified billing',
      () =>
        jsonResponse(
          ANTHROPIC.reply({
            model: MODEL,
            usage: { ...ANTHROPIC.usage, server_tool_use: { web_search_requests: 1 } },
          }),
        ),
      MODEL,
    ],
  ])('are recorded for an attempt with %s', async (_label, reply, returnedModel) => {
    const { provider, store, tasks } = rig({ reply });
    await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(store.calls.filter((call) => call.kind === 'response')).toEqual([
      {
        kind: 'response',
        attemptId: REQUEST.accounting.attemptId,
        providerRequestId: 'msg_01abc',
        returnedModel,
      },
    ]);
  });

  it('are not invented when the response has none', async () => {
    const { provider, store, tasks } = rig({
      reply: () => {
        const reply = ANTHROPIC.reply({ model: MODEL });
        return jsonResponse(Object.fromEntries(Object.entries(reply).filter(([k]) => k !== 'id')));
      },
    });
    await provider.generate(REQUEST, live());
    await tasks.idle();
    expect(kinds(store)).toEqual(['admit', 'settle']);
  });
});
