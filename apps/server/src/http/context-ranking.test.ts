import { ProviderError, type AiProvider, type ProviderRequest } from '@ltw/ai';
import type { ContextAction, EntityContextResponse, RelevanceTraceView } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_MARKERS,
  TOKENS,
  get,
  plantNpcBoundary,
  ravenfordApp,
  seededEngine,
  testAiGateway,
} from '../testing/ravenford-app.ts';

/**
 * AI relevance over HTTP (docs/adr/0021-ai-relevance.md). `ranking=ai`
 * re-rates the legal actions of a real context and changes nothing else.
 * The Stage 140 validation gate: any AI outage or failure leaves valid
 * deterministic context behavior — the very context a plain request gets.
 */
const MIRA = '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER';
const ELOWEN = 'elowen-starwhisper';

/** A ranker that puts every offered key at `high`, in reverse order. */
function reversing(): AiProvider & { readonly requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    id: 'reverser',
    requests,
    generate: (request) => {
      requests.push(request);
      if (request.task.kind !== 'relevance') return Promise.reject(new Error('not ranking'));
      const ranking = [...request.task.prompt.actions]
        .reverse()
        .map(({ key }) => ({ key, relevance: 'high' }));
      return Promise.resolve({ output: { ranking }, model: 'reverser', usage: null });
    },
  };
}

async function appWith(budgetMs: number, ...providers: AiProvider[]) {
  const engine = await seededEngine();
  await plantNpcBoundary(engine);
  const ai = { ...testAiGateway(...providers), relevanceBudgetMs: budgetMs };
  return { app: await ravenfordApp(engine, ai), ai };
}

const contextOf = async (app: FastifyInstance, url: string, token: string = TOKENS.player) => {
  const response = await get(app, url, token);
  expect(response.statusCode).toBe(200);
  return response.json<EntityContextResponse>();
};

const withoutRelevance = (actions: readonly ContextAction[]) =>
  actions.map((action) => JSON.stringify({ ...action, relevance: undefined })).sort();

describe('GET …/context?ranking=ai', () => {
  it('answers deterministically, asking no ranker, unless asked', async () => {
    const ranker = reversing();
    const { app } = await appWith(2_000, ranker);
    const plain = await contextOf(app, MIRA);

    expect(plain.ranking).toEqual({
      source: 'deterministic',
      status: 'NOT_REQUESTED',
      traceId: null,
    });
    expect(ranker.requests).toHaveLength(0);
  });

  it('re-rates and reorders the legal actions only, and traces it for the DM', async () => {
    const ranker = reversing();
    const { app } = await appWith(2_000, ranker);
    const plain = await contextOf(app, MIRA);
    const ranked = await contextOf(app, `${MIRA}&ranking=ai`);

    expect(ranked.ranking).toMatchObject({ source: 'ai', status: 'RANKED' });
    expect(withoutRelevance(ranked.context.actions)).toEqual(
      withoutRelevance(plain.context.actions),
    );
    const legal = plain.context.actions.filter((a) => a.legal);
    expect(ranked.context.actions.slice(0, legal.length)).toEqual(
      [...legal].reverse().map((action) => ({ ...action, relevance: 'high' })),
    );
    expect(ranked.context.actions.slice(legal.length)).toEqual(
      plain.context.actions.filter((a) => !a.legal),
    );
    expect({ ...ranked.context, actions: [] }).toEqual({ ...plain.context, actions: [] });

    const traceUrl = `/campaigns/ravenford/ai/traces/${ranked.ranking.traceId ?? ''}`;
    expect((await get(app, traceUrl, TOKENS.player)).statusCode).toBe(403);
    const trace = (await get(app, traceUrl, TOKENS.dm)).json<RelevanceTraceView>();
    expect(trace).toMatchObject({
      purpose: 'relevance',
      capability: 'fast-context',
      scope: `CHARACTER:${ELOWEN}`,
      entityId: 'mira-vale',
      status: 'RANKED',
      canonicalEvents: [],
    });
  });

  it('AI outage or failure leaves valid deterministic context behavior', async () => {
    const silent: AiProvider = { id: 'silent', generate: () => new Promise(() => undefined) };
    const invalid = {
      id: 'invalid',
      generate: () => Promise.resolve({ output: { ranking: [] }, model: 'x', usage: null }),
    };
    const failures: [string, AiProvider[], string][] = [
      ['no ranker configured', [], 'AI_UNAVAILABLE'],
      [
        'provider error',
        [{ id: 'down', generate: () => Promise.reject(new ProviderError('UNAVAILABLE', 'down')) }],
        'AI_UNAVAILABLE',
      ],
      [
        'provider crash',
        [{ id: 'crash', generate: () => Promise.reject(new TypeError('boom')) }],
        'AI_UNAVAILABLE',
      ],
      ['invalid output, repaired invalid', [invalid], 'INVALID_OUTPUT'],
      ['no answer within the budget', [silent], 'TIMEOUT'],
    ];
    for (const [name, providers, status] of failures) {
      const { app } = await appWith(100, ...providers);
      const plain = await contextOf(app, MIRA);
      const started = performance.now();
      const ranked = await contextOf(app, `${MIRA}&ranking=ai`);

      expect(ranked.context, name).toEqual(plain.context);
      expect(ranked.ranking, name).toMatchObject({ source: 'deterministic', status });
      expect(performance.now() - started, name).toBeLessThan(2_000);
    }
  });

  it('sends the ranker only what Elowen may know, and never an ID', async () => {
    const ranker = reversing();
    const { app } = await appWith(2_000, ranker);
    await contextOf(app, `${MIRA}&ranking=ai`);
    const sent = JSON.stringify({ ...ranker.requests[0], signal: undefined });

    expect(sent).toContain('Mira Vale');
    for (const marker of FORBIDDEN_MARKERS[`CHARACTER:${ELOWEN}`] ?? []) {
      expect(sent, marker).not.toContain(marker);
    }
    for (const marker of [
      'NBXTRUTH',
      'NBXDMNOTE',
      'NBXORINSECRET',
      'NBXMIRAWILLING',
      'NBXCLUE',
      'nbxclaim',
      'NBXHIDDENNAME',
      'NBXDESCRIPTION',
    ]) {
      expect(sent, marker).not.toContain(marker);
    }
    for (const id of [
      '"mira-vale"',
      '"guild-caravan"',
      `"${ELOWEN}"`,
      'party-mira-departure',
      'mem-',
    ]) {
      expect(sent, id).not.toContain(id);
    }
  });

  it('keeps the route’s checks: bad query 400, outsider 404, no acting character 403', async () => {
    const ranker = reversing();
    const { app } = await appWith(2_000, ranker);
    expect((await get(app, `${MIRA}&ranking=always`, TOKENS.player)).statusCode).toBe(400);
    expect((await get(app, `${MIRA}&ranking=ai`, TOKENS.outsider)).statusCode).toBe(404);
    const dmView = '/campaigns/ravenford/entities/mira-vale/context?perspective=DM&ranking=ai';
    expect((await get(app, dmView, TOKENS.dm)).statusCode).toBe(403);
    expect(ranker.requests).toHaveLength(0);
    // The DM may rank as a character.
    const asElowen = `/campaigns/ravenford/entities/mira-vale/context?perspective=CHARACTER:${ELOWEN}&ranking=ai`;
    expect((await contextOf(app, asElowen, TOKENS.dm)).ranking.status).toBe('RANKED');
  });
});
