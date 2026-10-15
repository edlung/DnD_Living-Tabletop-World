import { InMemoryAiTraceStore, type AiRequestStart, type FrozenOutcome } from '@ltw/ai';
import type { AiAccountingDiagnosticView, AiTraceView } from '@ltw/contracts';

import { LOCAL_ONLY, type AiJournal, type RouteIdentity } from '../ai/journal.ts';

/**
 * Test support: an in-memory request journal for HTTP and composition tests (docs/adr/0032-live-ai.md,
 * B2). It records each start with the route identity composition gave it; its diagnostic has the
 * lifecycle only (no accounting store, so no attempts). PostgreSQL tests use `PostgresAiJournal`.
 */
export class MemoryAiJournal implements AiJournal {
  readonly store: InMemoryAiTraceStore;
  readonly identities = new Map<string, RouteIdentity>();

  constructor(store: InMemoryAiTraceStore = new InMemoryAiTraceStore()) {
    this.store = store;
  }

  begin(start: AiRequestStart, identity: RouteIdentity): Promise<boolean> {
    this.identities.set(start.requestId, identity);
    return this.store.start(start);
  }

  start(start: AiRequestStart): Promise<boolean> {
    return this.begin(start, LOCAL_ONLY);
  }

  finalize(outcome: FrozenOutcome): Promise<void> {
    return this.store.finalize(outcome);
  }

  get(campaignId: string, traceId: string): Promise<AiTraceView | null> {
    return this.store.get(campaignId, traceId);
  }

  diagnose(campaignId: string, traceId: string): Promise<AiAccountingDiagnosticView | null> {
    return memoryDiagnose(this.store, campaignId, traceId);
  }
}

/** The lifecycle-only diagnostic of an in-memory store. */
export async function memoryDiagnose(
  store: InMemoryAiTraceStore,
  campaignId: string,
  traceId: string,
): Promise<AiAccountingDiagnosticView | null> {
  const start = store.starts().find((s) => s.requestId === traceId && s.campaignId === campaignId);
  if (start === undefined) return null;
  const outcome = store.outcome(traceId);
  const trace = await store.get(campaignId, traceId);
  return {
    traceId,
    campaignId,
    purpose: start.purpose,
    capability: start.capability,
    configuredModel: null,
    createdAt: '1970-01-01T00:00:00.000Z',
    deadlineAt: '1970-01-01T00:00:00.000Z',
    lifecycle: outcome === null ? 'pending' : 'recorded',
    callerOutcome: outcome,
    traceRecorded: trace !== null,
    incomplete: outcome === null,
    attempts: [],
  };
}
