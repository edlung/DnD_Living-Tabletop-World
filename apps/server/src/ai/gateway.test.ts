import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InMemoryAiTraceStore, createLocalProvider, outputResponse } from '@ltw/ai';
import type {
  AiCapability,
  DmIntentResponse,
  EntityContextResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Secret, loadConfig, type AppConfig } from '../platform/config/config.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  recording,
  seededEngine,
  testProvider,
} from '../testing/ravenford-app.ts';
import { CompositionError, composeRouter } from './composition.ts';
import { createAiGateway } from './gateway.ts';

/**
 * Composition at Stage 300 remediation checkpoints A and B1 (docs/adr/0032-live-ai.md, amendment
 * 2026-10-11): every capability is local or deterministic whatever keys and routes say; no remote
 * adapter is built, no key revealed, nothing fetched. A key alone implies no route. The router
 * admits only the genuine local provider and registered admitted wrappers, by identity.
 */
class ThrowingSecret extends Secret {
  override reveal(): string {
    throw new Error('a provider key was revealed');
  }
}

const routeOf = (ai: AppConfig['ai'], capability: AiCapability) =>
  createAiGateway(ai, new InMemoryAiTraceStore())
    .router.providersFor(capability)
    .map((provider) => provider.id);

const keyed: AppConfig['ai'] = {
  ...loadConfig({}).ai,
  anthropic: { apiKey: new ThrowingSecret('k'), model: 'claude-opus-5-5', timeoutMs: 30_000 },
  deepseek: { apiKey: new ThrowingSecret('k'), model: 'deepseek-flash', timeoutMs: 30_000 },
  routes: {
    reasoning: ['anthropic:claude-opus-5-5', 'local'],
    'npc-dialogue': ['deepseek:deepseek-flash', 'local'],
    narrative: ['anthropic:claude-opus-5-5', 'deepseek:deepseek-flash', 'local'],
    'fast-context': ['deepseek:deepseek-flash'],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createAiGateway at checkpoints A and B1', () => {
  it('routes locally without keys, and relevance nowhere (ADR 0021)', () => {
    const none = loadConfig({}).ai;
    expect(routeOf(none, 'reasoning')).toEqual(['local']);
    expect(routeOf(none, 'npc-dialogue')).toEqual(['local']);
    expect(routeOf(none, 'narrative')).toEqual(['local']);
    expect(routeOf(none, 'fast-context')).toEqual([]);
    for (const capability of ['continuity', 'vision'] as const) {
      expect(routeOf(none, capability)).toEqual([]);
    }
  });

  it('builds no remote provider from keys or routes, and reports those routes as disabled', () => {
    expect(routeOf(keyed, 'reasoning')).toEqual(['local']);
    expect(routeOf(keyed, 'npc-dialogue')).toEqual(['local']);
    expect(routeOf(keyed, 'narrative')).toEqual(['local']);
    expect(routeOf(keyed, 'fast-context')).toEqual([]);
    expect(createAiGateway(keyed, new InMemoryAiTraceStore()).disabledRemoteRoutes).toEqual([
      'reasoning=anthropic:claude-opus-5-5',
      'npc-dialogue=deepseek:deepseek-flash',
      'narrative=anthropic:claude-opus-5-5',
      'narrative=deepseek:deepseek-flash',
      'fast-context=deepseek:deepseek-flash',
    ]);
    // A key alone is not a route.
    const keyOnly = loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-test', DEEPSEEK_API_KEY: 'sk-test' });
    expect(routeOf(keyOnly.ai, 'reasoning')).toEqual(['local']);
    expect(createAiGateway(keyOnly.ai, new InMemoryAiTraceStore()).disabledRemoteRoutes).toEqual(
      [],
    );
  });

  it('serves every capability over HTTP without revealing a key or fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ai = createAiGateway(keyed, new InMemoryAiTraceStore());
    const app = await ravenfordApp(await seededEngine(), ai);
    try {
      const intent = await post(
        app,
        '/campaigns/ravenford/ai/intents',
        { text: 'Advance time by 1 hour.' },
        TOKENS.dm,
      );
      expect(intent.json<DmIntentResponse>().status).toBe('PROPOSED');
      const reply = await post(
        app,
        '/campaigns/ravenford/npcs/mira-vale/dialogue',
        { characterId: 'elowen-starwhisper', intent: { kind: 'talk' }, line: 'Hello.' },
        TOKENS.player,
      );
      expect(reply.statusCode).toBeLessThan(500);
      expect(reply.json<NpcDialogueResponse>().reply?.status ?? 'none').not.toBe('AI_UNAVAILABLE');
      const ranked = await get(
        app,
        '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
        TOKENS.player,
      );
      expect(ranked.json<EntityContextResponse>().ranking).toMatchObject({
        source: 'deterministic',
        status: 'AI_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps raw adapters out of every non-test module, testing and evaluation included', async () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const raw = new Set([
      'anthropic-provider.ts',
      'openai-compatible-provider.ts',
      'raw-provider.ts',
    ]);
    const offenders: string[] = [];
    const routers: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const text = await readFile(path, 'utf8');
          const file = relative(root, path);
          const specifiers = [...text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map(
            (match) => match[1] ?? '',
          );
          const importsRaw = specifiers.some((specifier) =>
            raw.has(specifier.split('/').at(-1) ?? ''),
          );
          if (importsRaw && !raw.has(entry.name)) offenders.push(file);
          if (text.includes('new CapabilityRouter(')) routers.push(file);
        }
      }
    };
    await walk(root);
    expect(offenders).toEqual([]);
    // Runtime (main) and evaluation build their router through `composeRouter` only; the other
    // routers are test support for HTTP/UI tests, never composition.
    expect(routers.sort()).toEqual([
      join('ai', 'composition.ts'),
      join('testing', 'ravenford-app.ts'),
      join('testing', 'scenario', 'session.ts'),
      join('testing', 'ui-server.ts'),
    ]);
  });

  it('admits only the genuine local provider and registered admitted wrappers', () => {
    const local = createLocalProvider();
    const valid = () => Promise.resolve(outputResponse({}, 'm'));
    expect(composeRouter({ reasoning: [local] }).providersFor('reasoning')).toEqual([local]);
    for (const forged of [
      testProvider('local', 'local', valid),
      { ...local },
      recording(local),
      testProvider('anthropic', 'remote', valid),
    ]) {
      expect(() => composeRouter({ reasoning: [forged] })).toThrow(CompositionError);
    }
    expect(() => composeRouter({ 'fast-context': [local] })).toThrow(/no local provider/);
    expect(() => composeRouter({ reasoning: [local, local] })).toThrow();
  });

  it.each(['Advance time by 0 minutes.', 'Advance time by 99999999999999 days.'])(
    'answers an invalid local intent (%s) after one local attempt, over HTTP',
    async (text) => {
      const traces = new InMemoryAiTraceStore();
      const app = await ravenfordApp(await seededEngine(), createAiGateway(keyed, traces));
      try {
        const response = await post(app, '/campaigns/ravenford/ai/intents', { text }, TOKENS.dm);
        expect(response.json<DmIntentResponse>()).toMatchObject({
          status: 'INVALID_OUTPUT',
          proposal: null,
          committable: false,
        });
        const trace = await traces.get('ravenford', response.json<DmIntentResponse>().traceId);
        expect(trace?.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
          ['local', 'initial', 'invalid'],
        ]);
      } finally {
        await app.close();
      }
    },
  );

  it('issues UUID trace IDs and ISO timestamps', () => {
    const gateway = createAiGateway(loadConfig({}).ai, new InMemoryAiTraceStore());
    expect(gateway.ids.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const now = gateway.clock.now();
    expect(new Date(now).toISOString()).toBe(now);
    expect(gateway.relevanceBudgetMs).toBe(2_000);
  });
});
