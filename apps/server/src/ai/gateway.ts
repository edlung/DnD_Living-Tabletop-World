import { randomUUID } from 'node:crypto';

import { createLocalProvider, type AiTraceStore, type RelevanceDeps } from '@ltw/ai';

import type { AppConfig } from '../platform/config/config.ts';
import { composeRouter } from './composition.ts';

/**
 * Composition of the AI gateway (docs/adr/0017-ai-gateway.md §2; docs/adr/0032-live-ai.md,
 * amendment 2026-10-11). Stage 300 remediation checkpoints A and B1: every capability is local or
 * deterministic, whatever keys, `LTW_AI_ROUTES` or stored approvals exist. No remote adapter is
 * constructed and no key is revealed until checkpoint B2 connects durable admission and journaling
 * to every remote path; configured remote routes are only reported as disabled. A key alone never
 * implies a route. `reasoning` (DM intents), `npc-dialogue` (ADR 0020 §3) and `narrative`
 * (Chronicle prose, ADR 0024) use the local provider; `fast-context` (relevance, ADR 0021) has
 * none, its fallback being the Context Engine. The router is built by `composeRouter`, which
 * accepts only the genuine local provider and admitted wrappers. The gateway holds no World Engine.
 */
export interface AiGateway extends RelevanceDeps {
  /** `capability=provider:model` entries the configuration names but this build never constructs. */
  readonly disabledRemoteRoutes: readonly string[];
}

export function createAiGateway(config: AppConfig['ai'], traces: AiTraceStore): AiGateway {
  const local = createLocalProvider();
  // Frozen, like its router: nothing may swap a route or provider in after composition.
  return Object.freeze({
    router: composeRouter({
      reasoning: [local],
      'npc-dialogue': [local],
      narrative: [local],
      'fast-context': [],
    }),
    relevanceBudgetMs: config.relevanceBudgetMs,
    traces,
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date().toISOString(), nowMs: () => performance.now() },
    disabledRemoteRoutes: Object.entries(config.routes ?? {}).flatMap(([capability, specs]) =>
      specs.filter((spec) => spec !== 'local').map((spec) => `${capability}=${spec}`),
    ),
  });
}
