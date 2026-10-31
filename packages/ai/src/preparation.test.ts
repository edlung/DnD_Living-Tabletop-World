import { describe, expect, it, vi } from 'vitest';

import type { IntentDeps } from './intent.ts';
import { runCampaignPreparation, type CampaignPreparationInput } from './preparation.ts';
import {
  outputResponse,
  ProviderError,
  type ProviderResponse,
  type RoutedProvider,
} from './providers.ts';
import { CapabilityRouter } from './router.ts';
import { controlledJournal } from './testing/journal.ts';
import { payloadOf, scripted, scriptedLocal, testBrand } from './testing/providers.ts';
import { InMemoryAiTraceStore, type AiTraceStore } from './traces.ts';

type Prepared = { readonly name: string };
const input = (
  extra: Partial<CampaignPreparationInput<Prepared>> = {},
): CampaignPreparationInput<Prepared> => ({
  traceId: 'preallocated-trace',
  ownerId: 'private-owner-id',
  draftId: 'private-draft-id',
  jobId: 'private-job-id',
  stage: 'concept',
  sessionId: 'durable-preparation-session',
  system: 'Static instructions.',
  prompt: 'Private authoring seed.',
  output: { name: 'concept', description: 'A concept', schema: { type: 'object' } },
  validate: (value) =>
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
      ? { ok: true, value: { name: value.name } }
      : { ok: false, issues: ['INVALID_CONCEPT'] },
  ...extra,
});

function dependencies(
  providers: readonly RoutedProvider[] = [],
  traces: AiTraceStore = new InMemoryAiTraceStore(),
) {
  let sequence = 0;
  const next = vi.fn(() => `attempt-${String(++sequence)}`);
  const deps: IntentDeps = {
    router: new CapabilityRouter({ 'campaign-preparation': providers }),
    traces,
    ids: { next },
    clock: { now: () => '2026-10-30T12:00:00.000Z', nowMs: () => performance.now() },
    requestTimeoutMs: 1000,
  };
  return { deps, next };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('campaign preparation lifecycle', () => {
  it('uses a real workshop subject and preallocated trace, without inventing a campaign or play session', async () => {
    const traces = new InMemoryAiTraceStore();
    const remote = scripted('verified-remote', { name: 'New world' });
    const { deps, next } = dependencies([remote], traces);
    const result = await runCampaignPreparation(deps, input());
    expect(result).toMatchObject({
      status: 'GENERATED',
      value: { name: 'New world' },
      traceId: 'preallocated-trace',
      provider: 'verified-remote',
      model: 'verified-remote-model',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(traces.starts()).toEqual([
      expect.objectContaining({
        requestId: 'preallocated-trace',
        campaignId: null,
        subject: { kind: 'workshop', ownerId: 'private-owner-id', draftId: 'private-draft-id' },
        sessionId: 'durable-preparation-session',
        capability: 'campaign-preparation',
      }),
    ]);
    expect(remote.requests[0]?.accounting).toMatchObject({
      requestId: 'preallocated-trace',
      campaignId: null,
      attemptId: 'attempt-1',
      subject: { kind: 'workshop', ownerId: 'private-owner-id', draftId: 'private-draft-id' },
    });
    expect(traces.all()[0]).toMatchObject({
      traceId: 'preallocated-trace',
      campaignId: null,
      status: 'GENERATED',
      canonicalEvents: [],
    });
    expect(traces.outcome('preallocated-trace')).toMatchObject({ status: 'GENERATED', code: null });
    expect(await traces.get('private-draft-id', 'preallocated-trace')).toBeNull();
  });

  it.each(['empty', 'local-only'] as const)(
    'returns honest unavailable for %s instead of local canned content',
    async (route) => {
      const local = scriptedLocal({ name: 'A local fixture must not be selected' });
      const traces = new InMemoryAiTraceStore();
      const { deps, next } = dependencies(route === 'empty' ? [] : [local], traces);
      const result = await runCampaignPreparation(deps, input());
      expect(result).toEqual({
        status: 'AI_UNAVAILABLE',
        value: null,
        traceId: 'preallocated-trace',
        provider: null,
        model: null,
        issues: [],
        attempts: [],
      });
      expect(local.requests).toEqual([]);
      expect(next).not.toHaveBeenCalled();
      expect(traces.all()[0]?.status).toBe('AI_UNAVAILABLE');
    },
  );

  it.each(['fail', 'reject', 'stall'] as const)(
    'calls no provider without durable start: %s',
    async (start) => {
      const journal = controlledJournal({ start });
      const remote = scripted('remote', { name: 'Forbidden without a trace' });
      const { deps } = dependencies([remote], journal);
      const caller = new AbortController();
      const result = runCampaignPreparation(deps, input({ signal: caller.signal }));
      if (start === 'stall') caller.abort();
      expect(await result).toMatchObject({
        status: 'AI_UNAVAILABLE',
        traceId: null,
        value: null,
        attempts: [],
        issues: ['NO_DURABLE_START'],
      });
      expect(remote.requests).toEqual([]);
      expect(journal.finalizeCalls()).toBe(0);
    },
  );

  it('repairs one invalid remote answer on the same provider and never selects local content', async () => {
    const remote = scripted('remote', { wrong: true }, { name: 'Repaired' });
    const local = scriptedLocal({ name: 'Local' });
    const { deps } = dependencies([remote, local]);
    const result = await runCampaignPreparation(deps, input());
    expect(result.status).toBe('GENERATED');
    expect(result.value).toEqual({ name: 'Repaired' });
    expect(result.attempts.map((attempt) => [attempt.kind, attempt.outcome])).toEqual([
      ['initial', 'invalid'],
      ['repair', 'valid'],
    ]);
    expect(remote.requests).toHaveLength(2);
    expect(remote.requests[1]?.system).toBe(remote.requests[0]?.system);
    expect(remote.requests[1]?.prompt).toContain(input().prompt);
    expect(remote.requests[1]?.task).toEqual({
      kind: 'campaign-preparation',
      stage: 'concept',
      repair: { output: { wrong: true }, issues: ['INVALID_CONCEPT'] },
    });
    expect(local.requests).toEqual([]);
  });

  it('stops after one invalid repair and preserves the validation finding', async () => {
    const remote = scripted('remote', {}, {}, { name: 'Must not reach a third call' });
    const { deps } = dependencies([remote]);
    const result = await runCampaignPreparation(deps, input());
    expect(result).toMatchObject({
      status: 'INVALID_OUTPUT',
      value: null,
      issues: ['INVALID_CONCEPT'],
    });
    expect(remote.requests).toHaveLength(2);
  });

  it('does not substitute a local campaign when the remote provider fails', async () => {
    const remote = scripted('remote', new ProviderError('UNAVAILABLE', 'Unavailable'));
    const local = scriptedLocal({ name: 'A canned replacement' });
    const { deps } = dependencies([remote, local]);
    const result = await runCampaignPreparation(deps, input());
    expect(result.value).toBeNull();
    expect(result.provider).toBeNull();
    expect(result.status).toBe('DISPATCH_UNKNOWN');
    expect(remote.requests).toHaveLength(1);
    expect(local.requests).toEqual([]);
  });

  it('does not serialize worker/accounting identities into the provider payload', async () => {
    const remote = scripted('remote', { name: 'World' });
    const { deps } = dependencies([remote]);
    await runCampaignPreparation(deps, input());
    const payload = payloadOf(remote.requests[0]);
    const serialized = JSON.stringify(payload);
    for (const secret of [
      input().ownerId,
      input().draftId,
      input().jobId,
      input().sessionId,
      input().traceId,
    ])
      expect(serialized).not.toContain(secret);
    expect(payload?.task).toEqual({ kind: 'campaign-preparation', stage: 'concept', repair: null });
    expect(serialized).not.toContain('accounting');
  });

  it('starts no provider when the caller was already cancelled', async () => {
    const remote = scripted('remote', { name: 'Too late' });
    const { deps } = dependencies([remote]);
    const caller = new AbortController();
    caller.abort();
    const result = await runCampaignPreparation(deps, input({ signal: caller.signal }));
    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', value: null, attempts: [] });
    expect(remote.requests).toEqual([]);
  });

  it('starts no repair after validation cancels the caller', async () => {
    const caller = new AbortController();
    const remote = scripted('remote', {}, { name: 'Unwanted repair' });
    const { deps } = dependencies([remote]);
    const result = await runCampaignPreparation(
      deps,
      input({
        signal: caller.signal,
        validate: () => {
          caller.abort();
          return { ok: false, issues: ['INVALID_CONCEPT'] };
        },
      }),
    );
    expect(result.value).toBeNull();
    expect(remote.requests).toHaveLength(1);
    expect(result.attempts).toEqual([
      expect.objectContaining({ error: 'CALLER_CANCELLED', output: null }),
    ]);
  });

  it.each([false, true])(
    'freezes cancellation honestly when transport dispatched=%s and rejects late output',
    async (dispatched) => {
      const began = deferred<undefined>();
      const reply = deferred<ProviderResponse>();
      const remote = testBrand('remote', 'remote', (_request, context) => {
        if (dispatched) context.onStart();
        began.resolve(undefined);
        return reply.promise;
      });
      const traces = new InMemoryAiTraceStore();
      const { deps } = dependencies([remote], traces);
      const caller = new AbortController();
      const result = runCampaignPreparation(deps, input({ signal: caller.signal }));
      await began.promise;
      caller.abort();
      const frozen = await result;
      expect(frozen).toMatchObject({
        status: dispatched ? 'DISPATCH_UNKNOWN' : 'AI_UNAVAILABLE',
        value: null,
        provider: null,
      });
      expect(frozen.attempts).toEqual([
        expect.objectContaining({
          outcome: 'error',
          error: 'CALLER_CANCELLED',
          output: null,
        }),
      ]);
      expect(frozen.attempts[0]?.billing?.status).toBe(dispatched ? 'unknown' : 'not_dispatched');
      const saved = structuredClone(traces.all());
      reply.resolve(outputResponse({ name: 'Late private output' }, 'remote-model'));
      await reply.promise;
      await Promise.resolve();
      expect(traces.all()).toEqual(saved);
      expect(JSON.stringify(traces.all())).not.toContain('Late private output');
    },
  );
});
