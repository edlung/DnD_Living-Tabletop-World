import { InMemoryAiTraceStore } from '@ltw/ai';
import type { AiCapability } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../platform/config/config.ts';
import { createAiGateway } from './gateway.ts';

/**
 * Routing for `reasoning` (ADR 0017 §2), `npc-dialogue` (ADR 0020 §3), and
 * `narrative` (Chronicle prose, ADR 0024 §3):
 * `[anthropic, local]` with a key, `[local]` without.
 */
const routeOf = (env: Record<string, string>, capability: AiCapability = 'reasoning') =>
  createAiGateway(loadConfig(env).ai, new InMemoryAiTraceStore())
    .router.providersFor(capability)
    .map((provider) => provider.id);

describe('createAiGateway', () => {
  it('routes to the local provider only without a key', () => {
    expect(routeOf({})).toEqual(['local']);
    expect(routeOf({}, 'npc-dialogue')).toEqual(['local']);
    expect(routeOf({}, 'narrative')).toEqual(['local']);
  });

  it('routes to Anthropic first, then local, with a key', () => {
    expect(routeOf({ ANTHROPIC_API_KEY: 'sk-ant-test' })).toEqual(['anthropic', 'local']);
    expect(routeOf({ ANTHROPIC_API_KEY: 'sk-ant-test' }, 'npc-dialogue')).toEqual([
      'anthropic',
      'local',
    ]);
    expect(routeOf({ ANTHROPIC_API_KEY: 'sk-ant-test' }, 'narrative')).toEqual([
      'anthropic',
      'local',
    ]);
  });

  it('routes relevance to Anthropic alone, and nowhere without a key (ADR 0021)', () => {
    expect(routeOf({ ANTHROPIC_API_KEY: 'sk-ant-test' }, 'fast-context')).toEqual(['anthropic']);
    expect(routeOf({}, 'fast-context')).toEqual([]);
    expect(createAiGateway(loadConfig({}).ai, new InMemoryAiTraceStore()).relevanceBudgetMs).toBe(
      2_000,
    );
  });

  it('routes no other capability', () => {
    const gateway = createAiGateway(loadConfig({}).ai, new InMemoryAiTraceStore());

    for (const capability of ['continuity', 'vision'] as const) {
      expect(gateway.router.providersFor(capability)).toEqual([]);
    }
  });

  it('issues UUID trace IDs and ISO timestamps', () => {
    const gateway = createAiGateway(loadConfig({}).ai, new InMemoryAiTraceStore());

    expect(gateway.ids.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const now = gateway.clock.now();
    expect(new Date(now).toISOString()).toBe(now);
  });
});
