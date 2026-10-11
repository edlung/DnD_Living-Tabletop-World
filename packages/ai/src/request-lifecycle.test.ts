import type { AiTraceView, ChronicleTraceView } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { TEMPLATE_MODEL, type RenderedChronicle } from './chronicle.ts';
import { outputResponse, type RoutedProvider } from './providers.ts';
import { DeadlineConfigError } from './request-deadline.ts';
import {
  CAPABILITIES,
  capabilityHarness,
  validOutput,
  type Capability,
} from './testing/capabilities.ts';
import { controlledJournal, spinUntil } from './testing/journal.ts';
import { payloadOf, scripted, testBrand, type ScriptedProvider } from './testing/providers.ts';

/**
 * The request lifecycle of every use case (docs/adr/0032-live-ai.md, B2;
 * docs/STAGE_300_REMEDIATION_DESIGN.md §1–2): durable start or the no-start response, one
 * whole-request deadline, the outcome freeze and the stored trace agreeing with what was returned.
 */
let harness: Awaited<ReturnType<typeof capabilityHarness>>;
beforeAll(async () => {
  harness = await capabilityHarness();
});

const routeOf = (capability: Capability, remote: RoutedProvider) => (local: RoutedProvider) =>
  capability === 'relevance' ? [remote] : [remote, local];

/** A remote provider that never answers, whatever its signal says. */
function hanging(): ScriptedProvider & { readonly calls: () => number } {
  let calls = 0;
  const provider = testBrand('remote', 'remote', (_request, attempt) => {
    calls += 1;
    attempt.onStart();
    return new Promise(() => undefined);
  });
  return Object.assign(provider, { requests: [], calls: () => calls });
}

const NO_START = {
  intent: {
    traceId: null,
    status: 'AI_UNAVAILABLE',
    proposal: null,
    issues: [],
    committable: false,
  },
  dialogue: { traceId: null, status: 'AI_UNAVAILABLE', text: null, canonical: false },
} as const;

function expectNoStart(capability: Capability, value: unknown, expired: boolean) {
  switch (capability) {
    case 'intent':
    case 'dialogue':
      expect(value).toEqual(NO_START[capability]);
      return;
    case 'chronicle': {
      const rendered = value as RenderedChronicle;
      expect(rendered).toMatchObject({ status: 'AI_UNAVAILABLE', traceId: null });
      expect(rendered.prose).toMatchObject({
        provider: 'template',
        model: TEMPLATE_MODEL,
        traceId: null,
      });
      expect(rendered.prose.paragraphs.length).toBeGreaterThan(0);
      return;
    }
    case 'relevance':
      expect(value).toMatchObject({
        ranking: {
          source: 'deterministic',
          status: expired ? 'TIMEOUT' : 'AI_UNAVAILABLE',
          traceId: null,
        },
      });
  }
}

describe.each(CAPABILITIES)('%s without a durable request start', (capability) => {
  it.each(['fail', 'reject'] as const)(
    'answers the no-start response when the start %ss, dispatching nothing',
    async (start) => {
      const remote = scripted('remote', validOutput);
      const journal = controlledJournal({ start });
      const answer = await harness.runWith(capability, routeOf(capability, remote), {
        traces: journal,
      });
      expectNoStart(capability, answer.value, false);
      expect(remote.requests).toEqual([]);
      expect(answer.localCalls).toBe(0);
      expect(journal.finalizeCalls()).toBe(0);
      expect(journal.store.all()).toEqual([]);
    },
  );

  it('answers within the deadline when the start stalls, dispatching nothing', async () => {
    const remote = scripted('remote', validOutput);
    const journal = controlledJournal({ start: 'stall' });
    const began = performance.now();
    const answer = await harness.runWith(capability, routeOf(capability, remote), {
      traces: journal,
      timeoutMs: 40,
    });
    expect(performance.now() - began).toBeLessThan(1_000);
    expectNoStart(capability, answer.value, true);
    expect(remote.requests).toEqual([]);
    expect(answer.localCalls).toBe(0);
  });
});

/** The public status each capability reports for its cancellation row. */
const VALID: Record<Capability, string> = {
  intent: 'PROPOSED',
  dialogue: 'REPLIED',
  chronicle: 'RENDERED',
  relevance: 'RANKED',
};
const CANCELLED: Record<Capability, string> = {
  intent: 'AI_UNAVAILABLE',
  dialogue: 'AI_UNAVAILABLE',
  chronicle: 'AI_UNAVAILABLE',
  relevance: 'TIMEOUT',
};

describe.each(CAPABILITIES)('%s at its whole-request deadline', (capability) => {
  it('freezes the cancellation row with the attempt in flight, and no local switch', async () => {
    const remote = hanging();
    const journal = controlledJournal();
    const answer = await harness.runWith(capability, routeOf(capability, remote), {
      traces: journal,
      timeoutMs: 40,
    });
    expect(answer.status).toBe(CANCELLED[capability]);
    expect(answer.traceId).not.toBeNull();
    expect(answer.localCalls).toBe(0);
    if (capability === 'chronicle') expect(answer.result).toBe('template');
    const trace = await journal.get('ravenford', answer.traceId ?? '');
    expect(trace?.status).toBe(CANCELLED[capability]);
    expect(trace?.attempts).toMatchObject([
      {
        provider: 'remote',
        kind: 'initial',
        outcome: 'error',
        error: 'CALLER_CANCELLED',
        output: null,
        billing: { status: 'unknown', costMicros: null },
      },
    ]);
    expect(remote.calls()).toBe(1);
  });

  it('freezes cancellation when a valid answer arrives after the deadline, before its timer', async () => {
    // Answers validly, but only after spinning past the deadline: no timer fires in between, so
    // only the monotonic clock (the policy's check, then the freeze's) can see the expiry.
    const late = testBrand('remote', 'remote', (request, attempt) => {
      attempt.onStart();
      spinUntil(attempt.deadlineAtMs);
      return Promise.resolve(outputResponse(validOutput(request), 'remote-model'));
    });
    const journal = controlledJournal();
    const answer = await harness.runWith(capability, routeOf(capability, late), {
      traces: journal,
      timeoutMs: 30,
    });
    expect(answer.status).toBe(CANCELLED[capability]);
    expect(answer.result).toEqual(
      capability === 'chronicle' ? 'template' : capability === 'relevance' ? 'deterministic' : null,
    );
    const trace = await journal.get('ravenford', answer.traceId ?? '');
    expect(trace?.attempts).toMatchObject([
      { outcome: 'error', error: 'CALLER_CANCELLED', output: null },
    ]);
    expect(JSON.stringify(trace)).not.toContain('Mira nods');
  });

  it('starts no provider, local included, after a denial answered past the deadline', async () => {
    const late = testBrand('remote', 'remote', (_request, attempt) => {
      spinUntil(attempt.deadlineAtMs);
      return Promise.resolve({ kind: 'denied', code: 'ADMISSION_UNAVAILABLE' } as const);
    });
    const journal = controlledJournal();
    const answer = await harness.runWith(capability, routeOf(capability, late), {
      traces: journal,
      timeoutMs: 30,
    });
    expect(answer.localCalls).toBe(0);
    expect(answer.status).toBe(CANCELLED[capability]);
    expect(answer.traceId).not.toBeNull();
    const trace = await journal.get('ravenford', answer.traceId ?? '');
    expect(trace?.attempts.map((a) => [a.provider, a.error])).toEqual([
      ['remote', 'CALLER_CANCELLED'],
    ]);
  });

  it('returns the frozen result at the deadline when its trace write stalls, and they agree', async () => {
    const journal = controlledJournal({ holdFinalize: true });
    const began = performance.now();
    const answer = await harness.runWith(
      capability,
      routeOf(capability, scripted('remote', validOutput)),
      { traces: journal, timeoutMs: 60 },
    );
    expect(performance.now() - began).toBeLessThan(1_000);
    expect(answer.status).toBe(VALID[capability]);
    // Pending: the trace is not readable yet.
    expect(await journal.get('ravenford', answer.traceId ?? '')).toBeNull();
    journal.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const trace = await journal.get('ravenford', answer.traceId ?? '');
    expect(trace).not.toBeNull();
    expectAgreement(capability, answer.value, trace as AiTraceView);
  });
});

/** The returned public result and the stored trace describe the same frozen outcome. */
function expectAgreement(capability: Capability, value: unknown, trace: AiTraceView) {
  switch (trace.purpose) {
    case 'dm-intent':
      expect(value).toMatchObject({ status: trace.status, proposal: trace.proposal });
      return;
    case 'npc-dialogue':
      expect(value).toMatchObject({ status: trace.status, text: trace.reply });
      return;
    case 'chronicle': {
      const rendered = value as RenderedChronicle;
      const chronicle: ChronicleTraceView = trace;
      expect(rendered.status).toBe(chronicle.status);
      expect(rendered.prose.paragraphs).toEqual(chronicle.paragraphs);
      expect(rendered.prose.provider).toBe(chronicle.attempts.at(-1)?.provider);
      expect(rendered.prose.traceId).toBe(chronicle.traceId);
      return;
    }
    case 'relevance':
      expect(value).toMatchObject({ ranking: { status: trace.status, traceId: trace.traceId } });
      expect(trace.ranking).not.toBeNull();
      expect(capability).toBe('relevance');
  }
}

describe('accounting identity and sessions', () => {
  it('runs only the local provider when the campaign has no active play session', async () => {
    for (const capability of CAPABILITIES) {
      const remote = scripted('remote', validOutput);
      const journal = controlledJournal();
      const answer = await harness.runWith(capability, routeOf(capability, remote), {
        traces: journal,
        session: null,
      });
      expect(remote.requests).toEqual([]);
      const [start] = journal.store.starts();
      expect(start?.sessionId).toBeNull();
      const trace = await journal.get('ravenford', answer.traceId ?? '');
      if (capability === 'relevance') {
        expect(answer.status).toBe('AI_UNAVAILABLE');
        expect(trace?.attempts).toEqual([]);
      } else {
        expect(answer.localCalls).toBe(1);
        expect(trace?.attempts).toMatchObject([
          { provider: 'local', kind: 'initial', billing: { status: 'local', costMicros: '0' } },
        ]);
      }
    }
  });

  it('gives every attempt the request ID (the trace ID), its own attempt ID and kind', async () => {
    for (const capability of CAPABILITIES) {
      const remote = scripted('remote', { nonsense: true }, validOutput);
      const journal = controlledJournal();
      const answer = await harness.runWith(capability, routeOf(capability, remote), {
        traces: journal,
        session: 'session-42',
      });
      const trace = await journal.get('ravenford', answer.traceId ?? '');
      const sent = remote.requests.map((request) => request.accounting);
      expect(sent.map((a) => a.requestId)).toEqual([answer.traceId, answer.traceId]);
      expect(sent.map((a) => a.attemptKind)).toEqual(['initial', 'repair']);
      expect(sent.map((a) => a.sessionId)).toEqual(['session-42', 'session-42']);
      expect(sent.map((a) => a.attemptId)).toEqual(trace?.attempts.map((a) => a.attemptId));
      expect(new Set(sent.map((a) => a.attemptId)).size).toBe(2);
      expect(journal.store.starts()[0]).toMatchObject({
        requestId: answer.traceId,
        sessionId: 'session-42',
        campaignId: 'ravenford',
      });
      // Identity is application metadata: never part of what a provider may serialize.
      for (const request of remote.requests) {
        const payload = JSON.stringify(payloadOf(request));
        for (const id of [request.accounting.requestId, request.accounting.attemptId]) {
          expect(payload).not.toContain(id);
        }
        expect(payload).not.toContain('session-42');
      }
    }
  });

  it('stores the fallback outcome code with the caller outcome', async () => {
    const journal = controlledJournal();
    const relevance = await harness.runWith(
      'relevance',
      () => [scripted('remote', new Error('down'))],
      { traces: journal },
    );
    expect(journal.store.outcome(relevance.traceId ?? '')).toEqual({
      status: 'AI_UNAVAILABLE',
      provider: null,
      code: 'PROVIDER_FAILURE',
    });
    // A fresh journal: the harness numbers each run's requests from the same start.
    const other = controlledJournal();
    const intent = await harness.runWith('intent', (local) => [local], { traces: other });
    expect(other.store.outcome(intent.traceId ?? '')).toEqual({
      status: 'PROPOSED',
      provider: 'local',
      code: null,
    });
  });

  it('refuses a missing or invalid whole-request deadline before starting', async () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      const journal = controlledJournal();
      await expect(
        harness.runWith('intent', (local) => [local], { traces: journal, timeoutMs }),
      ).rejects.toThrow(DeadlineConfigError);
      expect(journal.startCalls()).toBe(0);
    }
  });
});
