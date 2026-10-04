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

/**
 * Composition of the AI gateway (docs/adr/0017-ai-gateway.md §2): `reasoning`
 * (DM intents) and `npc-dialogue` (NPC replies, ADR 0020 §3) route to
 * `[anthropic, local]` with a key and `[local]` without. `fast-context`
 * (relevance, ADR 0021) routes to `[anthropic]` with a key and nowhere
 * without: its deterministic fallback is the Context Engine itself.
 * `narrative` (Chronicle prose, ADR 0024) routes like `reasoning`. The
 * gateway holds no World Engine: it reads what it is given.
 */
export function createAiGateway(
  config: AppConfig['ai'],
  traces: AiTraceStore,
  options: { readonly fetch?: typeof fetch } = {},
): RelevanceDeps {
  const providers: AiProvider[] = [];
  const { anthropic } = config;
  if (anthropic) {
    providers.push(
      createAnthropicProvider({
        apiKey: () => anthropic.apiKey.reveal(),
        model: anthropic.model,
        timeoutMs: anthropic.timeoutMs,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
    );
  }
  const remote = [...providers];
  providers.push(createLocalProvider());
  return {
    router: new CapabilityRouter({
      reasoning: providers,
      'npc-dialogue': providers,
      narrative: providers,
      'fast-context': remote,
    }),
    relevanceBudgetMs: config.relevanceBudgetMs,
    traces,
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date().toISOString(), nowMs: () => performance.now() },
  };
}
