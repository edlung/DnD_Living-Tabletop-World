import {
  relevanceOutputSchema,
  type AiAttemptView,
  type AiTraceView,
  type ContextAction,
  type ContextRanking,
  type EntityContextView,
  type Relevance,
  type RelevanceTraceView,
} from '@ltw/contracts';
import type { Actor, ResolvedPerspective, WorldState } from '@ltw/domain';

import {
  runWithFallback,
  type AttemptProgress,
  type FallbackResult,
  type OutputCheck,
} from './fallback.ts';
import type { IntentDeps } from './intent.ts';
import { rankerContext, relevanceRequest, type RankerContext } from './relevance-prompt.ts';

/**
 * AI relevance (docs/adr/0021-ai-relevance.md, owner decisions). On request,
 * a `fast-context` provider re-rates the legal actions of a context the
 * Context Engine already computed, within a time budget. Only `relevance`
 * and the order of legal actions can change: no action is added, removed,
 * or altered, illegal actions keep their deterministic rating, and no AI
 * text reaches the player. On any outage, invalid output, or an exceeded
 * budget, the deterministic context is returned as it was. Traced.
 */
export interface RelevanceDeps extends IntentDeps {
  /** How long a request waits for the ranker before answering deterministically. */
  readonly relevanceBudgetMs: number;
}

export interface RelevanceInput {
  readonly campaignId: string;
  readonly actor: Actor;
  readonly state: WorldState;
  /** The acting character's perspective, which the context was computed for. */
  readonly perspective: ResolvedPerspective;
  readonly actingCharacterId: string;
  /** The Context Engine's deterministic context. */
  readonly context: EntityContextView;
}

export interface RankedContext {
  readonly actions: readonly ContextAction[];
  readonly ranking: ContextRanking;
}

type Ranking = readonly { readonly key: string; readonly relevance: Relevance }[];

const CAPABILITY = 'fast-context';
const RANK: Readonly<Record<Relevance, number>> = { high: 0, medium: 1, low: 2 };
const MAX_ISSUES = 20;

/** A ranking must name every offered key exactly once, and nothing else. */
export function validateRanking(output: unknown, keys: readonly string[]): OutputCheck<Ranking> {
  const parsed = relevanceOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, MAX_ISSUES)
        .map((issue) => `${issue.path.join('.') || '(output)'}: ${issue.message}`),
    };
  }
  const offered = new Set(keys);
  const seen = new Set<string>();
  const issues: string[] = [];
  parsed.data.ranking.forEach(({ key }, index) => {
    if (!offered.has(key)) issues.push(`ranking.${String(index)}.key: "${key}" was not offered`);
    else if (seen.has(key)) issues.push(`ranking.${String(index)}.key: "${key}" appears twice`);
    seen.add(key);
  });
  for (const key of keys) if (!seen.has(key)) issues.push(`ranking: "${key}" is missing`);
  return issues.length > 0
    ? { ok: false, issues: issues.slice(0, MAX_ISSUES) }
    : { ok: true, value: parsed.data.ranking };
}

/**
 * The legal actions re-rated and in the ranker's order, every other field
 * exactly as computed; illegal actions as they were. Stable by relevance, so
 * within a level the ranked legal actions come first.
 */
export function applyRanking(
  actions: readonly ContextAction[],
  keys: RankerContext['keys'],
  ranking: Ranking,
): ContextAction[] {
  const indexOf = new Map(keys.map(({ key, index }) => [key, index]));
  const ranked = ranking.flatMap(({ key, relevance }) => {
    const action = actions[indexOf.get(key) ?? -1];
    return action ? [{ ...action, relevance }] : [];
  });
  const offered = new Set(keys.map(({ index }) => index));
  const rest = actions.filter((_, index) => !offered.has(index));
  return [...ranked, ...rest].sort((a, b) => RANK[a.relevance] - RANK[b.relevance]);
}

export async function rankContextActions(
  deps: RelevanceDeps,
  input: RelevanceInput,
): Promise<RankedContext> {
  const built = rankerContext(
    input.state,
    input.perspective,
    input.actingCharacterId,
    input.context,
  );
  const deterministic = (
    status: ContextRanking['status'],
    traceId: string | null,
  ): RankedContext => ({
    actions: input.context.actions,
    ranking: { source: 'deterministic', status, traceId },
  });
  if (built.keys.length < 2) return deterministic('NOTHING_TO_RANK', null);

  const controller = new AbortController();
  const expired = new Promise<'TIMEOUT'>((resolve) => {
    controller.signal.addEventListener('abort', () => {
      resolve('TIMEOUT');
    });
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, deps.relevanceBudgetMs);
  const keys = built.keys.map(({ key }) => key);
  // What happened so far, so the budget's end records the attempt in flight without awaiting it.
  const settled: AiAttemptView[] = [];
  let pending: Extract<AttemptProgress, { type: 'start' }> | null = null;
  const running = runWithFallback({
    providers: deps.router.providersFor(CAPABILITY),
    build: (repair) => relevanceRequest(built.prompt, repair),
    validate: (output) => validateRanking(output, keys),
    nowMs: deps.clock.nowMs,
    signal: controller.signal,
    onProgress: (event) => {
      if (event.type === 'start') pending = event;
      else if (event.type === 'abandoned') pending = null;
      else if (event.type === 'end') {
        settled.push(event.attempt);
        pending = null;
      }
    },
  });
  // A provider that ignores the signal is left behind; its result is never used.
  running.catch(() => undefined);
  let result: FallbackResult<Ranking> | 'TIMEOUT';
  try {
    result = await Promise.race([running, expired]);
  } finally {
    clearTimeout(timer);
  }
  const answered = result === 'TIMEOUT' || controller.signal.aborted ? null : result;
  // Assigned in `onProgress`, which control-flow analysis cannot see.
  const inFlight = pending as Extract<AttemptProgress, { type: 'start' }> | null;
  const attempts: readonly AiAttemptView[] =
    answered?.attempts ??
    (inFlight === null
      ? [...settled]
      : [
          ...settled,
          {
            provider: inFlight.provider,
            kind: inFlight.kind,
            model: null,
            outcome: 'error',
            error: 'CALLER_CANCELLED',
            issues: [],
            output: null,
            latencyMs: Math.round(deps.clock.nowMs() - inFlight.startedMs),
            usage: null,
          },
        ]);
  const status: RelevanceTraceView['status'] =
    answered === null ? 'TIMEOUT' : answered.status === 'VALID' ? 'RANKED' : answered.status;
  const applied = answered?.status === 'VALID' ? answered.value : null;

  const trace: AiTraceView = {
    traceId: deps.ids.next(),
    campaignId: input.campaignId,
    actorId: input.actor.actorId,
    purpose: 'relevance',
    capability: CAPABILITY,
    scope: input.perspective.label,
    sourceIds: built.sourceIds,
    input: '',
    attempts,
    status,
    entityId: input.context.entity.entityId,
    actions: built.keys.map(({ key, index }) => {
      const action = input.context.actions[index];
      return {
        key,
        id: action?.id ?? '',
        topicId: action?.topic?.entityId ?? null,
        evidenceId: action?.evidence?.knowledgeId ?? null,
      };
    }),
    ranking: applied,
    issues:
      answered === null
        ? [`no ranking within ${String(deps.relevanceBudgetMs)} ms`]
        : answered.status === 'INVALID_OUTPUT'
          ? answered.issues
          : [],
    canonicalEvents: [],
    createdAt: deps.clock.now(),
  };
  await deps.traces.append(trace);
  if (!applied) return deterministic(status, trace.traceId);
  return {
    actions: applyRanking(input.context.actions, built.keys, applied),
    ranking: { source: 'ai', status: 'RANKED', traceId: trace.traceId },
  };
}
