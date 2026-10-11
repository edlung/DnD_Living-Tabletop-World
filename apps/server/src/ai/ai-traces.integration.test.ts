import { outputResponse } from '@ltw/ai';
import type {
  AiTraceView,
  DmIntentResponse,
  EntityContextResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  ravenfordApp,
  testAiGateway,
  testProvider,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { PostgresAiTraceStore } from './postgres-trace-store.ts';

/**
 * AI traces in PostgreSQL (migration 0002, ADR 0017 §7): append-only, per
 * campaign, and an intent request over a PostgreSQL World Engine leaves the
 * event store untouched. An NPC reply (ADR 0020 §3) is traced the same way;
 * only its intent's command reaches the event store.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await pool.end();
  await database.drop();
});

const TRACE: AiTraceView = {
  traceId: '00000000-00a1-4000-8000-000000000001',
  campaignId: 'ravenford',
  actorId: 'dm-ravenford',
  purpose: 'dm-intent',
  capability: 'reasoning',
  scope: 'PUBLIC',
  sourceIds: ['world#clock', 'north-gate'],
  input: 'Advance time by 1 hour.',
  attempts: [
    {
      provider: 'local',
      model: 'local-interpreter-1',
      kind: 'initial',
      outcome: 'valid',
      error: null,
      issues: [],
      output: '{"summary":"s","commands":[{"type":"AdvanceWorldTime","by":3600}]}',
      latencyMs: 5,
      usage: null,
    },
  ],
  status: 'PROPOSED',
  proposal: { summary: 's', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] },
  issues: [],
  canonicalEvents: [],
  createdAt: '2026-10-04T12:00:00.000Z',
};

const count = async (table: string) =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

describe('PostgresAiTraceStore', () => {
  it('stores a trace and returns it only within its campaign', async () => {
    const store = new PostgresAiTraceStore(pool);
    await store.append(TRACE);

    expect(await store.get('ravenford', TRACE.traceId)).toEqual(TRACE);
    expect(await store.get('elsewhere', TRACE.traceId)).toBeNull();
    expect(await store.get('ravenford', '00000000-00a1-4000-8000-0000000000ff')).toBeNull();
  });

  it('refuses to overwrite, update, or delete a trace', async () => {
    const store = new PostgresAiTraceStore(pool);
    await store.append(TRACE);

    await expect(store.append({ ...TRACE, input: 'rewritten' })).rejects.toThrow();
    await expect(pool.query(`UPDATE ltw_ai_traces SET status = 'INVALID_OUTPUT'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query('DELETE FROM ltw_ai_traces')).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE ltw_ai_traces')).rejects.toThrow(/append-only/);
    expect(await store.get('ravenford', TRACE.traceId)).toEqual(TRACE);
  });

  it('records an intent over HTTP and leaves the event store untouched', async () => {
    const engine = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
    const ai = { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) };
    const app = await ravenfordApp(engine, ai);
    apps.push(app);
    const events = await count('ltw_events');
    const commands = await count('ltw_commands');

    const response = await app.inject({
      method: 'POST',
      url: '/campaigns/ravenford/ai/intents',
      payload: { text: 'Add a fisherman near the North Gate who saw the guild caravan leave.' },
      headers: { authorization: `Bearer ${TOKENS.dm}` },
    });
    const { traceId, status } = response.json<DmIntentResponse>();

    expect(status).toBe('PROPOSED');
    expect(await count('ltw_events')).toBe(events);
    expect(await count('ltw_commands')).toBe(commands);
    expect(await count('ltw_ai_traces')).toBe(1);
    const trace = await get(app, `/campaigns/ravenford/ai/traces/${traceId}`, TOKENS.dm);
    expect(trace.json<AiTraceView>()).toMatchObject({ traceId, canonicalEvents: [] });
  });

  it('records NPC replies over HTTP: only the intent’s command reaches the event store', async () => {
    const engine = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
    const ai = { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) };
    const app = await ravenfordApp(engine, ai);
    apps.push(app);
    const say = (intent: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/campaigns/ravenford/npcs/mira-vale/dialogue',
        payload: { characterId: 'elowen-starwhisper', intent, line: 'Hello, Mira.' },
        headers: { authorization: `Bearer ${TOKENS.player}` },
      });
    const commands = await count('ltw_commands');
    const events = await count('ltw_events');

    const talked = (await say({ kind: 'talk' })).json<NpcDialogueResponse>();
    expect(talked.reply?.status).toBe('REPLIED');
    expect(await count('ltw_commands')).toBe(commands);
    expect(await count('ltw_events')).toBe(events);

    const asked = (
      await say({ kind: 'ask', topicId: 'old-trade-road' })
    ).json<NpcDialogueResponse>();
    const read = (
      await say({ kind: 'insight', topicId: 'guild-caravan' })
    ).json<NpcDialogueResponse>();
    expect(asked.command?.status).toBe('accepted');
    expect(read.command?.status).toBe('accepted');
    expect(await count('ltw_commands')).toBe(commands + 2);
    expect(await count('ltw_events')).toBeGreaterThan(events);
    expect(await count('ltw_ai_traces')).toBe(3);

    const trace = await get(
      app,
      `/campaigns/ravenford/ai/traces/${asked.reply?.traceId ?? ''}`,
      TOKENS.dm,
    );
    expect(trace.json<AiTraceView>()).toMatchObject({
      purpose: 'npc-dialogue',
      scope: 'NPC:mira-vale',
      input: 'Hello, Mira.',
      commandId: asked.command?.commandId,
      canonicalEvents: [],
    });
    // The new events survive a reload from PostgreSQL.
    expect((await engine.load('ravenford'))?.state.investigation.attempts.size).toBeGreaterThan(0);
  });

  it('records a relevance ranking over HTTP: traced, nothing canonical (ADR 0021)', async () => {
    const engine = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
    const ranker = testProvider('reverser', 'remote', (request) => {
      if (request.task.kind !== 'relevance') return Promise.reject(new Error('not ranking'));
      const ranking = [...request.task.prompt.actions]
        .reverse()
        .map(({ key }) => ({ key, relevance: 'high' }));
      return Promise.resolve(outputResponse({ ranking }, 'reverser'));
    });
    const ai = { ...testAiGateway(ranker), traces: new PostgresAiTraceStore(pool) };
    const app = await ravenfordApp(engine, ai);
    apps.push(app);
    const events = await count('ltw_events');

    const response = await app.inject({
      method: 'GET',
      url: '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    const { ranking } = response.json<EntityContextResponse>();

    expect(ranking).toMatchObject({ source: 'ai', status: 'RANKED' });
    expect(await count('ltw_events')).toBe(events);
    const trace = await get(
      app,
      `/campaigns/ravenford/ai/traces/${ranking.traceId ?? ''}`,
      TOKENS.dm,
    );
    expect(trace.json<AiTraceView>()).toMatchObject({
      purpose: 'relevance',
      entityId: 'mira-vale',
      canonicalEvents: [],
    });
  });
});
