import { ProviderError } from '@ltw/ai';
import type { AiTraceView, DmIntentResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ALL_SECRET_MARKERS,
  ASHEN_CIRCLE_ID,
  TOKENS,
  get,
  ravenfordApp,
  recording,
  seededEngine,
  testAiGateway,
  testProvider,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * AI intent and trace routes (ADR 0017 §6): DM only, ADR 0009 check order,
 * permission before any provider call, and no canonical change.
 */
const INTENTS = '/campaigns/ravenford/ai/intents';
const TEXT = 'Add a fisherman near the North Gate who saw the guild caravan leave.';

function spy() {
  const provider = recording();
  return { provider, requests: provider.requests };
}

const failing = testProvider('remote', 'remote', () =>
  Promise.reject(new ProviderError('TIMEOUT', 'slow')),
);

const post = (app: FastifyInstance, body: unknown, token?: string, url = INTENTS) =>
  app.inject({
    method: 'POST',
    url,
    payload: body as Record<string, unknown>,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

const versionOf = async (engine: WorldEngine) => (await engine.load('ravenford'))?.state.version;

let engine: WorldEngine;
beforeEach(async () => {
  engine = await seededEngine();
});

describe('POST /campaigns/:campaignId/ai/intents', () => {
  it('proposes for the DM without changing the world', async () => {
    const app = await ravenfordApp(engine);
    const before = await versionOf(engine);
    const response = await post(app, { text: TEXT }, TOKENS.dm);

    expect(response.statusCode).toBe(200);
    const body = response.json<DmIntentResponse>();
    expect(body).toMatchObject({ status: 'PROPOSED', issues: [], committable: false });
    expect(body.proposal?.commands.map((c) => c.type)).toEqual(['CreateEntity', 'AddKnowledge']);
    expect(await versionOf(engine)).toBe(before);
    for (const marker of ALL_SECRET_MARKERS) expect(response.body).not.toContain(marker);
  });

  it.each([
    ['no token', undefined, { text: TEXT }, 401],
    ['an empty text', TOKENS.dm, { text: '   ' }, 400],
    ['an extra key', TOKENS.dm, { text: TEXT, commit: true }, 400],
    ['an over-long text', TOKENS.dm, { text: 'x'.repeat(2_001) }, 400],
    ['a non-member', TOKENS.outsider, { text: TEXT }, 404],
    ['a player', TOKENS.player, { text: TEXT }, 403],
  ] as const)('refuses %s before any provider call', async (_label, token, body, status) => {
    const watched = spy();
    const ai = testAiGateway(watched.provider);
    const app = await ravenfordApp(engine, ai);
    const response = await post(app, body, token);

    expect(response.statusCode).toBe(status);
    expect(watched.requests).toHaveLength(0);
    expect(ai.traces.all()).toEqual([]);
  });

  it('answers 404 for a campaign that does not exist', async () => {
    const app = await ravenfordApp(engine);
    const response = await post(app, { text: TEXT }, TOKENS.dm, '/campaigns/nowhere/ai/intents');

    expect(withoutRequestId(response)).toEqual({
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('falls back to the next provider with the same context on failure', async () => {
    const local = spy();
    const ai = testAiGateway(failing, local.provider);
    const app = await ravenfordApp(engine, ai);
    const response = await post(app, { text: TEXT }, TOKENS.dm);

    expect(response.json<DmIntentResponse>().status).toBe('PROPOSED');
    const [trace] = ai.traces.all();
    expect(trace?.attempts.map((a) => [a.provider, a.kind, a.outcome, a.error])).toEqual([
      ['remote', 'initial', 'error', 'TIMEOUT'],
      ['local', 'fallback', 'valid', null],
    ]);
    expect(local.requests[0]?.task).toMatchObject({
      kind: 'dm-intent',
      context: { scope: 'PUBLIC' },
    });
  });

  it('reports AI_UNAVAILABLE as a result, not an error', async () => {
    const before = await versionOf(engine);
    const app = await ravenfordApp(engine, testAiGateway(failing));
    const response = await post(app, { text: TEXT }, TOKENS.dm);

    expect(response.statusCode).toBe(200);
    expect(response.json<DmIntentResponse>()).toMatchObject({
      status: 'AI_UNAVAILABLE',
      proposal: null,
      committable: false,
    });
    expect(await versionOf(engine)).toBe(before);
  });

  it('reports INVALID_OUTPUT for a request the directory cannot carry', async () => {
    const app = await ravenfordApp(engine);
    const response = await post(app, { text: 'Reveal the Ashen Circle.' }, TOKENS.dm);

    expect(response.json<DmIntentResponse>()).toMatchObject({
      status: 'INVALID_OUTPUT',
      proposal: null,
      committable: false,
    });
  });
});

describe('GET /campaigns/:campaignId/ai/traces/:traceId', () => {
  async function traced() {
    const app = await ravenfordApp(engine);
    const { traceId } = (await post(app, { text: TEXT }, TOKENS.dm)).json<DmIntentResponse>();
    return { app, url: `/campaigns/ravenford/ai/traces/${traceId}`, traceId };
  }

  it('shows the DM why the system proposed it', async () => {
    const { app, url, traceId } = await traced();
    const response = await get(app, url, TOKENS.dm);

    expect(response.statusCode).toBe(200);
    const trace = response.json<AiTraceView>();
    expect(trace).toMatchObject({
      traceId,
      actorId: 'dm-ravenford',
      purpose: 'dm-intent',
      scope: 'PUBLIC',
      input: TEXT,
      status: 'PROPOSED',
      canonicalEvents: [],
    });
    expect(trace.sourceIds).toContain('north-gate');
    expect(trace.sourceIds).not.toContain(ASHEN_CIRCLE_ID);
  });

  it.each([
    ['no token', undefined, 401],
    ['a non-member', TOKENS.outsider, 404],
    ['a player', TOKENS.player, 403],
  ] as const)('refuses %s', async (_label, token, status) => {
    const { app, url } = await traced();

    expect((await get(app, url, token)).statusCode).toBe(status);
  });

  it('answers 404 for an unknown trace and 400 for a malformed ID', async () => {
    const { app } = await traced();
    const unknown = '/campaigns/ravenford/ai/traces/00000000-0000-4000-8000-00000000ffff';

    expect((await get(app, unknown, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, '/campaigns/ravenford/ai/traces/x', TOKENS.dm)).statusCode).toBe(400);
  });
});
