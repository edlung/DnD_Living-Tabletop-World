import { randomUUID } from 'node:crypto';

import {
  createLocalProvider,
  type AiTraceStore,
  type RelevanceDeps,
  type RoutedProvider,
} from '@ltw/ai';
import type { AiAccountingDiagnosticView, AiCapability } from '@ltw/contracts';

import type { AppConfig } from '../platform/config/config.ts';
import { ROUTE_CAPABILITIES } from '../platform/config/ai-routes.ts';
import { AccountingTasks } from './accounting-tasks.ts';
import type { BudgetStore } from './accounting/types.ts';
import { admittedProvider } from './admitted-provider.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { ANTHROPIC_REQUEST_SETTINGS } from './request-settings.ts';
import { configuredEntry, type Catalog, type CatalogEntry } from './catalog.ts';
import { composeRouter } from './composition.ts';
import { LOCAL_ONLY, type AiJournal, type RouteIdentity } from './journal.ts';
import { createDeepSeekProvider } from './openai-compatible-provider.ts';
import type { RawRemoteProvider } from './raw-provider.ts';

/**
 * Composition of the AI gateway (docs/adr/0017-ai-gateway.md §2; docs/adr/0032-live-ai.md, B2).
 * `reasoning` (DM intents), `npc-dialogue` (ADR 0020 §3) and `narrative` (Chronicle prose, ADR 0024)
 * are `local` or one remote then local; `fast-context` (relevance, ADR 0021) is one remote or none,
 * its fallback being the Context Engine. A key alone never implies a route.
 *
 * A configured remote entry becomes a provider only as an admitted wrapper (`admitted-provider.ts`)
 * around a raw adapter, and only when all of these hold: a selected approval that exists in the
 * accounting store, the store itself, an explicitly verified catalog entry for that provider and
 * model, and the provider's key. Otherwise the entry is refused here, before any adapter is built or
 * key revealed, and the route is local only (no fictitious denied attempt). The key is read only by
 * `dispatch`, after durable admission. The verified catalog has one entry, `claude-sonnet-5-5`
 * (checkpoint C): any other model is refused. Even a routed Sonnet entry dispatches only for a
 * request with an eligible session (a play session captured from the campaign, or a registered
 * evaluation run) that durable admission accepts; otherwise nothing is sent and no key is read.
 * Anthropic requests carry the per-capability effort and `max_tokens` of `request-settings.ts`.
 *
 * Every request runs through the journal (`journal.ts`); a request start carries the approval only
 * for a capability whose route has an admitted remote provider. The gateway holds no World Engine.
 */
export interface AiGatewayOptions {
  readonly journal: AiJournal;
  /** The accounting store; null builds no remote provider. */
  readonly budget: BudgetStore | null;
  readonly catalog: Catalog;
  /** Whether `config.approvalId` names a stored approval (checked at startup). */
  readonly approvalStored: boolean;
  /** Background settlement, releases and stops; a fresh one by default. */
  readonly tasks?: AccountingTasks;
  /** Tests only: an injected transport. */
  readonly fetch?: typeof fetch;
}

/** Why a configured remote entry is not routed. */
export type RouteRefusal =
  | 'NO_APPROVAL_SELECTED'
  | 'APPROVAL_NOT_STORED'
  | 'NO_ACCOUNTING_STORE'
  | 'UNVERIFIED_MODEL'
  | 'NO_KEY';

/** What startup reports per capability: never keys, prompts or spending. */
export interface ResolvedRoute {
  readonly capability: AiCapability;
  /** The routed providers in order: `provider:model` (canonical) or `local`. */
  readonly providers: readonly string[];
  readonly refused: readonly { readonly entry: string; readonly reason: RouteRefusal }[];
}

export interface AiGateway extends RelevanceDeps {
  readonly routes: readonly ResolvedRoute[];
  readonly diagnostics: {
    diagnose(campaignId: string, traceId: string): Promise<AiAccountingDiagnosticView | null>;
  };
  readonly accounting: AccountingTasks;
}

const DEFAULT_ROUTE: Readonly<Record<(typeof ROUTE_CAPABILITIES)[number], readonly string[]>> = {
  reasoning: ['local'],
  'npc-dialogue': ['local'],
  narrative: ['local'],
  'fast-context': [],
  'campaign-preparation': [],
};

const MAX_TOKENS = 4_096;

export function createAiGateway(config: AppConfig['ai'], options: AiGatewayOptions): AiGateway {
  const local = createLocalProvider();
  const tasks = options.tasks ?? new AccountingTasks();
  const identities = new Map<AiCapability, RouteIdentity>();
  const resolved: ResolvedRoute[] = [];
  const routes: Partial<Record<AiCapability, readonly RoutedProvider[]>> = {};

  const raw = (
    capability: (typeof ROUTE_CAPABILITIES)[number],
    provider: string,
    model: string,
    entry: CatalogEntry,
  ): RawRemoteProvider | null => {
    const common = {
      model,
      acceptedModels: [entry.model, ...entry.aliases],
      maxTokens: Math.min(MAX_TOKENS, entry.limits.maxOutputTokens),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    };
    if (provider === 'anthropic' && config.anthropic !== null) {
      const { apiKey, timeoutMs } = config.anthropic;
      const settings = ANTHROPIC_REQUEST_SETTINGS[capability];
      return createAnthropicProvider({
        ...common,
        apiKey: () => apiKey.reveal(),
        timeoutMs:
          capability === 'campaign-preparation'
            ? (config.preparationTimeoutMs ?? timeoutMs)
            : timeoutMs,
        effort: settings.effort,
        maxTokens: Math.min(settings.maxTokens, entry.limits.maxOutputTokens),
        ...(entry.cache === '5m' ? { cache: '5m' as const } : {}),
      });
    }
    if (provider === 'deepseek' && config.deepseek !== null) {
      const { apiKey, timeoutMs } = config.deepseek;
      return createDeepSeekProvider({
        ...common,
        apiKey: () => apiKey.reveal(),
        timeoutMs:
          capability === 'campaign-preparation'
            ? (config.preparationTimeoutMs ?? timeoutMs)
            : timeoutMs,
        thinking: 'disabled',
      });
    }
    return null;
  };

  for (const capability of ROUTE_CAPABILITIES) {
    const specs = config.routes?.[capability] ?? DEFAULT_ROUTE[capability];
    const providers: RoutedProvider[] = [];
    const names: string[] = [];
    const refused: { entry: string; reason: RouteRefusal }[] = [];
    for (const spec of specs) {
      if (spec === 'local') {
        providers.push(local);
        names.push('local');
        continue;
      }
      const [provider = '', model = ''] = spec.split(':');
      const entry = configuredEntry(options.catalog, provider, model);
      const reason: RouteRefusal | null =
        config.approvalId === null
          ? 'NO_APPROVAL_SELECTED'
          : !options.approvalStored
            ? 'APPROVAL_NOT_STORED'
            : options.budget === null
              ? 'NO_ACCOUNTING_STORE'
              : entry === null
                ? 'UNVERIFIED_MODEL'
                : null;
      const adapter =
        reason === null && entry !== null ? raw(capability, provider, model, entry) : null;
      if (reason !== null || entry === null || adapter === null || options.budget === null) {
        refused.push({ entry: spec, reason: reason ?? 'NO_KEY' });
        continue;
      }
      providers.push(admittedProvider(adapter, { store: options.budget, entry, tasks }));
      names.push(`${entry.provider}:${entry.model}`);
      identities.set(capability, { approvalId: config.approvalId, configuredModel: model });
    }
    routes[capability] = providers;
    resolved.push({ capability, providers: names, refused });
  }

  const journal = options.journal;
  const traces: AiTraceStore = {
    start: (start, deadline) =>
      journal.begin(start, identities.get(start.capability) ?? LOCAL_ONLY, deadline),
    finalize: (outcome, deadline) => journal.finalize(outcome, deadline),
    get: (campaignId, traceId) => journal.get(campaignId, traceId),
    npcReplies: (campaignId, npcId, speakerId, limit) =>
      journal.npcReplies(campaignId, npcId, speakerId, limit),
  };
  // Frozen, like its router: nothing may swap a route or provider in after composition.
  const gateway: AiGateway = {
    router: composeRouter(routes),
    relevanceBudgetMs: config.relevanceBudgetMs,
    requestTimeoutMs: config.requestTimeoutMs,
    traces: Object.freeze(traces),
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date().toISOString(), nowMs: () => performance.now() },
    routes: Object.freeze(resolved),
    diagnostics: { diagnose: (campaignId, traceId) => journal.diagnose(campaignId, traceId) },
    accounting: tasks,
  };
  return Object.freeze(gateway);
}
