import {
  relevanceOutputSchema,
  type AiTraceView,
  type ContextAction,
  type ContextRanking,
  type EntityContextView,
  type Relevance,
  type RelevanceTraceView,
} from '@ltw/contracts';
import type { Actor, ResolvedPerspective, WorldState } from '@ltw/domain';

import type { OutputCheck } from './fallback.ts';
import type { IntentDeps } from './intent.ts';
import { rankerContext, relevanceRequest, type RankerContext } from './relevance-prompt.ts';
import { runAiRequest } from './request.ts';

/**
 * AI relevance (docs/adr/0021-ai-relevance.md, owner decisions). On request,
 * a `fast-context` provider re-rates the legal actions of a context the
 * Context Engine already computed, within a time budget. Only `relevance`
 * and the order of legal actions can change: no action is added, removed,
 * or altered, illegal actions keep their deterministic rating, and no AI
 * text reaches the player. On any outage, invalid output, or an exceeded
 * budget, the deterministic context is returned as it was. Traced.
 *
 * The budget is the request's whole deadline (docs/adr/0032-live-ai.md, B2): it covers the durable
 * start, admission, the provider and the wait for the trace write. Without a durable start the
 * actions return with no trace ID (TIMEOUT if the budget ran out, else AI_UNAVAILABLE) and nothing
 * runs. With one, the trace ID is returned at the deadline without awaiting a slow write: reading
 * that trace may answer 404 until it is stored, and forever if recovery records the request as
 * incomplete; the accounting diagnostic tells the two apart.
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

  const keys = built.keys.map(({ key }) => key);
  return runAiRequest(
    { traces: deps.traces, ids: deps.ids, nowMs: deps.clock.nowMs },
    {
      timeoutMs: deps.relevanceBudgetMs,
      start: {
        campaignId: input.campaignId,
        actorId: input.actor.actorId,
        purpose: 'relevance',
        capability: CAPABILITY,
        scope: input.perspective.label,
        sourceIds: built.sourceIds,
        sessionId: input.state.activeSessionId,
      },
      providers: deps.router.providersFor(CAPABILITY),
      fallback: {
        build: (repair) => relevanceRequest(built.prompt, repair),
        validate: (output) => validateRanking(output, keys),
      },
      noStart: (expired) => deterministic(expired ? 'TIMEOUT' : 'AI_UNAVAILABLE', null),
      freeze: (result, traceId) => {
        // The budget is the only cancellation here: it ends as TIMEOUT.
        const timedOut = result.status === 'AI_UNAVAILABLE' && result.code === 'CALLER_CANCELLED';
        const status: RelevanceTraceView['status'] = timedOut
          ? 'TIMEOUT'
          : result.status === 'VALID'
            ? 'RANKED'
            : result.status;
        const applied = result.status === 'VALID' ? result.value : null;
        const trace: AiTraceView = {
          traceId,
          campaignId: input.campaignId,
          actorId: input.actor.actorId,
          purpose: 'relevance',
          capability: CAPABILITY,
          scope: input.perspective.label,
          sourceIds: built.sourceIds,
          input: '',
          attempts: result.attempts,
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
          issues: timedOut
            ? [`no ranking within ${String(deps.relevanceBudgetMs)} ms`]
            : result.status === 'INVALID_OUTPUT'
              ? result.issues
              : [],
          canonicalEvents: [],
          createdAt: deps.clock.now(),
        };
        const response = applied
          ? {
              actions: applyRanking(input.context.actions, built.keys, applied),
              ranking: { source: 'ai', status: 'RANKED', traceId } as const,
            }
          : deterministic(status, traceId);
        return { response, trace };
      },
    },
  );
}
