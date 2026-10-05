import { randomUUID } from 'node:crypto';

import {
  CapabilityRouter,
  createLocalProvider,
  type AiProvider,
  type AiTraceStore,
  type RelevanceDeps,
} from '@ltw/ai';

import type { AppConfig } from '../platform/config/config.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';
import { SpendLedger, budgeted } from './budget.ts';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider.ts';

/**
 * Composition of the AI gateway (docs/adr/0017-ai-gateway.md §2; docs/adr/0032-live-ai.md).
 * Each capability has its own ordered list of providers. Without `LTW_AI_ROUTES`: `reasoning`
 * (DM intents), `npc-dialogue` (ADR 0020 §3), and `narrative` (Chronicle prose, ADR 0024) route
 * to `[anthropic, local]` with an Anthropic key and `[local]` without; `fast-context`
 * (relevance, ADR 0021) routes to `[anthropic]` with a key and nowhere without, its fallback
 * being the Context Engine itself. With it, each list names `provider:model` entries (and may
 * end in `local`). Every remote call passes the spend ledger, which fails closed when the daily
 * ceiling is reached. The gateway holds no World Engine: it reads what it is given.
 */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** Effort per capability: short structured replies need little reasoning. */
const EFFORT = {
  reasoning: 'medium',
  narrative: 'medium',
  'npc-dialogue': 'low',
  'fast-context': 'low',
} as const;
type Routed = keyof typeof EFFORT;
const CAPABILITIES = Object.keys(EFFORT) as Routed[];

export function createAiGateway(
  config: AppConfig['ai'],
  traces: AiTraceStore,
  options: { readonly fetch?: typeof fetch } = {},
): RelevanceDeps & { readonly ledger: SpendLedger } {
  const ledger = new SpendLedger(config.dailyBudgetUsd);
  const withFetch = options.fetch ? { fetch: options.fetch } : {};
  const local = createLocalProvider();

  const remote = (spec: string, capability: Routed): AiProvider | null => {
    const [provider, model] = spec.split(':');
    if (provider === 'anthropic' && config.anthropic) {
      const { anthropic } = config;
      return budgeted(
        createAnthropicProvider({
          apiKey: () => anthropic.apiKey.reveal(),
          model: model ?? anthropic.model,
          timeoutMs: anthropic.timeoutMs,
          // Haiku 4.5 rejects `output_config.effort`; the newer models take it.
          ...(/haiku/.test(model ?? anthropic.model) ? {} : { effort: EFFORT[capability] }),

          ...withFetch,
        }),
        ledger,
      );
    }
    if (provider === 'deepseek' && config.deepseek) {
      const { deepseek } = config;
      return budgeted(
        createOpenAiCompatibleProvider({
          id: 'deepseek',
          baseUrl: DEEPSEEK_BASE_URL,
          apiKey: () => deepseek.apiKey.reveal(),
          model: model ?? deepseek.model,
          timeoutMs: deepseek.timeoutMs,
          // DeepSeek reasons by default; a short structured reply does not need it.
          extraBody: { thinking: { type: 'disabled' } },
          ...withFetch,
        }),
        ledger,
      );
    }
    return null;
  };

  const defaults = (capability: Routed): string[] => {
    if (!config.anthropic) return capability === 'fast-context' ? [] : ['local'];
    const entry = `anthropic:${config.anthropic.model}`;
    return capability === 'fast-context' ? [entry] : [entry, 'local'];
  };

  const listFor = (capability: Routed): AiProvider[] =>
    (config.routes?.[capability] ?? defaults(capability)).flatMap((spec) => {
      if (spec === 'local') return [local];
      const provider = remote(spec, capability);
      return provider ? [provider] : [];
    });

  return {
    router: new CapabilityRouter(
      Object.fromEntries(CAPABILITIES.map((capability) => [capability, listFor(capability)])),
    ),
    relevanceBudgetMs: config.relevanceBudgetMs,
    traces,
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date().toISOString(), nowMs: () => performance.now() },
    ledger,
  };
}
