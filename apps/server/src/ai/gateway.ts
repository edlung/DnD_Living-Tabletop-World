import { randomUUID } from 'node:crypto';

import {
  CapabilityRouter,
  createLocalProvider,
  type AiProvider,
  type AiTraceStore,
  type IntentDeps,
} from '@ltw/ai';

import type { AppConfig } from '../platform/config/config.ts';
import { createAnthropicProvider } from './anthropic-provider.ts';

/**
 * Composition of the AI gateway (docs/adr/0017-ai-gateway.md §2): `reasoning`
 * routes to `[anthropic, local]` with a key and `[local]` without. The
 * gateway holds no World Engine: it reads snapshots and proposes.
 */
export function createAiGateway(
  config: AppConfig['ai'],
  traces: AiTraceStore,
  options: { readonly fetch?: typeof fetch } = {},
): IntentDeps {
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
  providers.push(createLocalProvider());
  return {
    router: new CapabilityRouter({ reasoning: providers }),
    traces,
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date().toISOString(), nowMs: () => performance.now() },
  };
}
