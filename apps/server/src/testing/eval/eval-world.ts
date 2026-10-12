import type { AiAttemptView, AiTraceView } from '@ltw/contracts';
import { InMemoryAiTraceStore } from '@ltw/ai';
import { InMemoryEventStore, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import { VERIFIED_CATALOG } from '../../ai/catalog.ts';
import { createAiGateway, type AiGateway } from '../../ai/gateway.ts';
import { loadConfig, type Env } from '../../platform/config/config.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../../world-engine/ravenford-seed.ts';
import { MemoryAiJournal } from '../memory-journal.ts';
import {
  MIDDLE_ENTROPY,
  plantNpcBoundary,
  ravenfordApp,
  seededEngine,
  testAuthoring,
} from '../ravenford-app.ts';
import { EVAL_CAMPAIGN } from './eval-live.ts';

/**
 * The evaluation world and its measurements (ADR 0032, checkpoint C). Each capability runs in a
 * fresh seeded Russian Ravenford with the Gate 04 boundary planted. The gateway is either the
 * offline composition (no keys, no routes, no approval: local providers only) or the live one
 * from `eval-live.ts`. Every request body a provider is sent passes through `sent` (never the
 * headers, so never a key), for the context-isolation check of the exact provider input.
 */
export interface EvalWorld {
  readonly app: Awaited<ReturnType<typeof ravenfordApp>>;
  readonly engine: WorldEngine;
  readonly ai: AiGateway;
  /** Provider request bodies, in order (live only). */
  readonly sent: readonly string[];
}

export interface EvalContext {
  readonly mode: 'offline' | 'live';
  readonly world: () => Promise<EvalWorld>;
  /** HTTP overhead allowed beyond the relevance deadline, disclosed in the report. */
  readonly relevanceToleranceMs: number;
}

/** Variables that could name or reach a remote provider; never read by an offline run. */
const REMOTE_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'LTW_AI_ROUTES',
  'LTW_AI_APPROVAL_ID',
];

export const offlineEnv = (env: Env): Env =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !REMOTE_VARIABLES.includes(name)));

async function seeded(ai: AiGateway, sent: readonly string[]): Promise<EvalWorld> {
  const engine = await seededEngine(
    new InMemoryEventStore(),
    // Insight checks and asks roll: enough scripted results for every dialogue case.
    scriptedDice(Array<number>(1_024).fill(15)),
    MIDDLE_ENTROPY,
    RAVENFORD_RU_FIXTURES_DIR,
  );
  await plantNpcBoundary(engine);
  const app = await ravenfordApp(engine, ai, testAuthoring());
  return { app, engine, ai, sent };
}

export const RELEVANCE_TOLERANCE_MS = 250;

export function offlineContext(env: Env): EvalContext {
  return {
    mode: 'offline',
    relevanceToleranceMs: RELEVANCE_TOLERANCE_MS,
    world: () =>
      seeded(
        // No accounting store and no approval: composition admits no remote provider.
        createAiGateway(loadConfig(offlineEnv(env)).ai, {
          journal: new MemoryAiJournal(new InMemoryAiTraceStore()),
          budget: null,
          catalog: VERIFIED_CATALOG,
          approvalStored: false,
        }),
        [],
      ),
  };
}

/** A transport that records each body it sends, then sends it unchanged. */
export function recording(transport: typeof fetch): { fetch: typeof fetch; sent: string[] } {
  const sent: string[] = [];
  const wrapped = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    sent.push(typeof init?.body === 'string' ? init.body : '');
    return transport(input, init);
  }) as typeof fetch;
  return { fetch: wrapped, sent };
}

export function liveContext(
  gatewayOver: (transport: typeof fetch) => AiGateway,
  transport: typeof fetch,
): EvalContext {
  return {
    mode: 'live',
    relevanceToleranceMs: RELEVANCE_TOLERANCE_MS,
    world: () => {
      const recorder = recording(transport);
      return seeded(gatewayOver(recorder.fetch), recorder.sent);
    },
  };
}

/** One request's end-to-end latency (admission, attempts, repair, fallback, persistence wait). */
export async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - started) };
}

export interface AttemptSummary {
  readonly provider: string;
  readonly model: string | null;
  readonly kind: string;
  readonly outcome: string;
  readonly error: string | null;
  readonly issues: readonly string[];
  readonly latencyMs: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

export interface Accounting {
  readonly remoteAttempts: number;
  readonly knownMicros: bigint;
  readonly heldMicros: bigint;
  readonly openAttempts: number;
  /**
   * The request's measured charge for the estimate: the sum of its dispatched attempts' terminal
   * charges (`settled` or `reconciled`, priced from every billed usage class), or null when it has
   * no dispatched attempt (never admitted, or released before transport) or any held attempt of
   * unknown charge.
   */
  readonly measuredMicros: bigint | null;
  readonly returnedModels: readonly string[];
  readonly providerRequestIds: number;
}

export interface Observed {
  readonly trace: AiTraceView | null;
  readonly attempts: readonly AttemptSummary[];
  readonly accounting: Accounting;
}

const summary = (attempt: AiAttemptView): AttemptSummary => ({
  provider: attempt.provider,
  model: attempt.model,
  kind: attempt.kind,
  outcome: attempt.outcome,
  error: attempt.error,
  issues: attempt.issues,
  latencyMs: attempt.latencyMs,
  usage: attempt.usage,
});

/** A request's trace and its durable accounting, after background settlement has run. */
export async function observe(world: EvalWorld, traceId: string | null): Promise<Observed> {
  await world.ai.accounting.idle();
  const trace = traceId === null ? null : await world.ai.traces.get(EVAL_CAMPAIGN, traceId);
  const diagnostic =
    traceId === null ? null : await world.ai.diagnostics.diagnose(EVAL_CAMPAIGN, traceId);
  const attempts = diagnostic?.attempts ?? [];
  // Terminal attempts are known charges; open ones are holds whose actual charge is unknown.
  const total = (open: boolean) =>
    attempts
      .filter((attempt) => (attempt.accounting === 'open') === open)
      .reduce((sum, attempt) => sum + BigInt(attempt.effectiveMicros), 0n);
  const charged = attempts.filter(
    (attempt) => attempt.accounting === 'settled' || attempt.accounting === 'reconciled',
  );
  const open = attempts.filter((attempt) => attempt.accounting === 'open').length;
  return {
    trace,
    attempts: (trace?.attempts ?? []).map(summary),
    accounting: {
      remoteAttempts: attempts.length,
      knownMicros: total(false),
      heldMicros: total(true),
      openAttempts: open,
      measuredMicros:
        open === 0 && charged.length > 0
          ? charged.reduce((sum, attempt) => sum + BigInt(attempt.effectiveMicros), 0n)
          : null,
      returnedModels: [
        ...new Set(attempts.flatMap((a) => (a.returnedModel === null ? [] : [a.returnedModel]))),
      ],
      providerRequestIds: attempts.filter((attempt) => attempt.providerRequestId !== null).length,
    },
  };
}
