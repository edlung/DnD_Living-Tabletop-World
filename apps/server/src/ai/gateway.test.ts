import { InMemoryAiTraceStore } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../platform/config/config.ts';
import { createAiGateway } from './gateway.ts';

/** Routing for `reasoning` (ADR 0017 §2): `[anthropic, local]` with a key, `[local]` without. */
const routeOf = (env: Record<string, string>) =>
  createAiGateway(loadConfig(env).ai, new InMemoryAiTraceStore())
    .router.providersFor('reasoning')
    .map((provider) => provider.id);

describe('createAiGateway', () => {
  it('routes to the local provider only without a key', () => {
    expect(routeOf({})).toEqual(['local']);
  });

  it('routes to Anthropic first, then local, with a key', () => {
    expect(routeOf({ ANTHROPIC_API_KEY: 'sk-ant-test' })).toEqual(['anthropic', 'local']);
  });

  it('routes no other capability in Stage 100', () => {
    const gateway = createAiGateway(loadConfig({}).ai, new InMemoryAiTraceStore());

    for (const capability of ['fast-context', 'npc-dialogue', 'narrative', 'vision'] as const) {
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
