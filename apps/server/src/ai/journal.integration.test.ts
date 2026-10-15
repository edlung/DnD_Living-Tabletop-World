import type {
  AiAccountingDiagnosticView,
  ChronicleTraceView,
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
} from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Secret, loadConfig, type AppConfig } from '../platform/config/config.ts';
import {
  accountingDb,
  delayedResponsePool,
  holdLock,
  seedApproval,
  type AccountingDb,
} from '../testing/accounting.ts';
import { FIXTURE_CATALOG } from '../testing/catalog-fixtures.ts';
import { fakeFetch, hanging, jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import { ANTHROPIC } from '../testing/raw-adapter-fixtures.ts';
import { TOKENS, get, post, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';
import { POLICY_LOCK_KEY } from './accounting/lock-keys.ts';
import { PostgresBudgetStore } from './accounting/postgres-budget-store.ts';
import { FINALIZER_GRACE_MS, recoverRequest } from './accounting/request-journal.ts';
import { identityResolver } from './catalog.ts';
import { createAiGateway, type AiGateway } from './gateway.ts';
import { readDiagnostic } from './diagnostics.ts';
import { PostgresAiJournal } from './journal.ts';
import { PostgresAiTraceStore } from './postgres-trace-store.ts';

/**
 * The request journal end to end over PostgreSQL (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2;
 * docs/adr/0032-live-ai.md, B2): durable start, admission, settlement, the frozen outcome stored
 * with its trace, the DM's diagnostic, a stalled finalizer and recovery, no-start answers, and a
 * stalled admission. Fixture catalog and an injected transport only: no network, no real price.
 */
class CountingSecret extends Secret {
  reveals = 0;
  override reveal(): string {
    this.reveals += 1;
    return 'sk-never-a-real-key';
  }
}

const SONNET = 'anthropic:claude-sonnet-5-5';
let db: AccountingDb;
const closers: (() => Promise<unknown>)[] = [];
beforeEach(async () => {
  db = await accountingDb();
  await seedApproval(db, { accountId: 'acct', approvalId: 'a1' });
});
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  await db.close();
});

interface Rig {
  readonly gateway: AiGateway;
  readonly app: Awaited<ReturnType<typeof ravenfordApp>>;
  readonly calls: FetchCall[];
  readonly secret: CountingSecret;
}

async function rig(
  options: {
    readonly journalPool?: pg.Pool;
    readonly respond?: (call: FetchCall) => Response | Promise<Response>;
    readonly routes?: AppConfig['ai']['routes'];
    readonly requestTimeoutMs?: number;
    readonly relevanceBudgetMs?: number;
    readonly patch?: (gateway: AiGateway) => AiGateway;
  } = {},
): Promise<Rig> {
  const secret = new CountingSecret('k');
  const fake = fakeFetch(
    options.respond ?? (() => jsonResponse(ANTHROPIC.reply({ model: 'claude-sonnet-5-5' }))),
  );
  const gateway = createAiGateway(
    {
      ...loadConfig({}).ai,
      anthropic: { apiKey: secret, model: 'claude-sonnet-5-5', timeoutMs: 30_000 },
      routes: options.routes ?? { reasoning: [SONNET, 'local'], 'fast-context': [SONNET] },
      approvalId: 'a1',
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
      relevanceBudgetMs: options.relevanceBudgetMs ?? 2_000,
    },
    {
      journal: new PostgresAiJournal(options.journalPool ?? db.pool),
      budget: new PostgresBudgetStore(db.pool, identityResolver(FIXTURE_CATALOG)),
      catalog: FIXTURE_CATALOG,
      approvalStored: true,
      fetch: fake.fetchImpl,
    },
  );
  const app = await ravenfordApp(await seededEngine(), options.patch?.(gateway) ?? gateway);
  closers.push(() => app.close());
  return { gateway, app, calls: fake.calls, secret };
}

const intent = async (app: Rig['app']) =>
  (
    await post(
      app,
      '/campaigns/ravenford/ai/intents',
      { text: 'Advance time by 1 hour.' },
      TOKENS.dm,
    )
  ).json<DmIntentResponse>();
const diagnostic = async (app: Rig['app'], traceId: string, token: string = TOKENS.dm) =>
  get(app, `/campaigns/ravenford/ai/accounting/${traceId}`, token);
const trace = (app: Rig['app'], traceId: string) =>
  get(app, `/campaigns/ravenford/ai/traces/${traceId}`, TOKENS.dm);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
/** Reads on the test's own pool: a stalled one-connection journal pool would queue an HTTP read. */
const storedTrace = (traceId: string) =>
  new PostgresAiTraceStore(db.pool).get('ravenford', traceId);
const storedDiagnostic = (traceId: string) => readDiagnostic(db.pool, 'ravenford', traceId);

describe('the journal of an admitted request', () => {
  it('stores the frozen outcome with its trace, settles the attempt, and diagnoses it for the DM', async () => {
    const { app, gateway, calls, secret } = await rig();
    const response = await intent(app);
    await gateway.accounting.idle();
    expect(response.status).toBe('PROPOSED');
    expect(calls).toHaveLength(1);
    expect(secret.reveals).toBe(1);
    const traceId = response.traceId ?? '';
    expect((await trace(app, traceId)).json()).toMatchObject({
      traceId,
      proposal: response.proposal,
    });

    const view = (await diagnostic(app, traceId)).json<AiAccountingDiagnosticView>();
    expect(view).toMatchObject({
      traceId,
      campaignId: 'ravenford',
      lifecycle: 'recorded',
      callerOutcome: { status: 'PROPOSED', provider: 'anthropic', code: null },
      traceRecorded: true,
      incomplete: false,
      configuredModel: 'claude-sonnet-5-5',
      attempts: [
        {
          attemptKind: 'initial',
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          pricingVersion: 'fixture-anthropic-sonnet-2',
          reservedMicros: '332160',
          accounting: 'settled',
          effectiveMicros: '3396',
        },
      ],
    });
    // Nothing about ceilings, other campaigns, approvals or stops.
    expect(Object.keys(view).sort()).toEqual(
      [
        'attempts',
        'callerOutcome',
        'campaignId',
        'capability',
        'configuredModel',
        'createdAt',
        'deadlineAt',
        'incomplete',
        'lifecycle',
        'purpose',
        'traceId',
        'traceRecorded',
      ].sort(),
    );
    // Quoted values: a bare `a1` also occurs in random UUID hex (a flaky false match).
    expect(JSON.stringify(view)).not.toMatch(/"a1"|"acct"|ceiling|remaining/);
  });

  it('keeps the 401/400/404/403 order and answers 404 for another campaign or an unknown ID', async () => {
    const { app } = await rig();
    const traceId = (await intent(app)).traceId ?? '';
    expect((await diagnostic(app, traceId, 'not-a-token')).statusCode).toBe(401);
    expect((await diagnostic(app, 'not-a-uuid')).statusCode).toBe(400);
    expect(
      (await get(app, `/campaigns/elsewhere/ai/accounting/${traceId}`, TOKENS.dm)).statusCode,
    ).toBe(404);
    expect((await diagnostic(app, traceId, TOKENS.player)).statusCode).toBe(403);
    expect((await diagnostic(app, '00000000-0000-4000-8000-000000000999')).statusCode).toBe(404);
  });
});

describe('a stalled finalizer', () => {
  it('returns the frozen relevance timeout at the deadline; the trace is pending, then recorded', async () => {
    const delayed = delayedResponsePool(
      db.database.url,
      /ltw_ai_request_outcomes \(request_id, kind, status/,
      1_500,
    );
    closers.push(() => delayed.pool.end());
    // A budget long enough that start and admission always finish and the attempt is dispatched
    // even under a loaded suite (repair 1: 300 ms let the deadline pass before admission); the
    // provider never answers, so the request still times out at its deadline.
    const budgetMs = 3_000;
    const { app, gateway, calls } = await rig({
      journalPool: delayed.pool,
      respond: hanging,
      relevanceBudgetMs: budgetMs,
    });
    const began = performance.now();
    const ranked = (
      await get(
        app,
        '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
        TOKENS.player,
      )
    ).json<EntityContextResponse>();
    const elapsed = performance.now() - began;
    // Returned at its deadline: not before it, and without waiting 1.5 s for the stalled write.
    expect(elapsed).toBeGreaterThan(budgetMs - 100);
    expect(elapsed).toBeLessThan(budgetMs + 1_000);
    expect(calls).toHaveLength(1);
    expect(ranked.ranking).toMatchObject({ source: 'deterministic', status: 'TIMEOUT' });
    const traceId = ranked.ranking.traceId ?? '';
    expect(traceId).not.toBe('');
    // Exactly that returned ID: no trace yet, but a diagnosable pending request with its hold.
    expect(await storedTrace(traceId)).toBeNull();
    expect(await storedDiagnostic(traceId)).toMatchObject({
      lifecycle: 'pending',
      traceRecorded: false,
      incomplete: true,
      // Fixture bound: 20,000 × 12 + 2,048 (relevance max_tokens, C) × 22.5 µ$.
      attempts: [{ accounting: 'open', effectiveMicros: '286080' }],
    });
    // The stalled write lands about 1.5 s after the deadline, inside the 5 s finalizer window.
    await sleep(2_500);
    await gateway.accounting.idle();
    expect((await trace(app, traceId)).json()).toMatchObject({ status: 'TIMEOUT', ranking: null });
    expect((await diagnostic(app, traceId)).json()).toMatchObject({
      lifecycle: 'recorded',
      callerOutcome: { status: 'TIMEOUT', code: 'CALLER_CANCELLED' },
      // The post-dispatch abort had no usage: the full hold stays for the operator.
      attempts: [{ accounting: 'open' }],
    });
  });

  it('commits the chapter, and leaves a permanent diagnostic-only record when it misses its window', async () => {
    const delayed = delayedResponsePool(
      db.database.url,
      /ltw_ai_request_outcomes \(request_id, kind, status/,
      FINALIZER_GRACE_MS + 2_000,
    );
    closers.push(() => delayed.pool.end());
    const { app } = await rig({
      journalPool: delayed.pool,
      routes: { narrative: ['local'] },
      requestTimeoutMs: 400,
    });
    const chapter = (
      await post(
        app,
        '/campaigns/ravenford/chronicle',
        { title: 'Chapter I', perspective: 'PARTY', from: 0 },
        TOKENS.dm,
      )
    ).json<GenerateChronicleResponse>();
    expect(chapter.chronicleId).not.toBeNull();
    const traceId = chapter.rendering.traceId ?? '';
    expect(traceId).not.toBe('');
    expect(await storedTrace(traceId)).toBeNull();
    await sleep(FINALIZER_GRACE_MS + 2_500);
    expect(await recoverRequest(db.pool, traceId)).toBe('recovered');
    expect((await trace(app, traceId)).statusCode).toBe(404);
    expect((await diagnostic(app, traceId)).json()).toMatchObject({
      lifecycle: 'recovered_incomplete',
      callerOutcome: null,
      traceRecorded: false,
      incomplete: true,
    });
    // The committed chapter keeps the trace ID it was given; recovery fabricates nothing.
    const chapters = (
      await get(app, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
    ).json<{ chapters: { prose: { traceId: string | null } }[] }>();
    expect(chapters.chapters.at(-1)?.prose.traceId).toBe(traceId);
  }, 20_000);

  it('records Chronicle prose matching the committed chapter once the late write lands', async () => {
    const delayed = delayedResponsePool(
      db.database.url,
      /ltw_ai_request_outcomes \(request_id, kind, status/,
      1_000,
    );
    closers.push(() => delayed.pool.end());
    const { app } = await rig({
      journalPool: delayed.pool,
      routes: { narrative: ['local'] },
      requestTimeoutMs: 400,
    });
    const chapter = (
      await post(
        app,
        '/campaigns/ravenford/chronicle',
        { title: 'Chapter I', perspective: 'PARTY', from: 0 },
        TOKENS.dm,
      )
    ).json<GenerateChronicleResponse>();
    const traceId = chapter.rendering.traceId ?? '';
    expect(await storedTrace(traceId)).toBeNull();
    await sleep(1_500);
    const stored = (await trace(app, traceId)).json<ChronicleTraceView>();
    const chapters = (
      await get(app, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
    ).json<{ chapters: { prose: { paragraphs: unknown; provider: string; traceId: string } }[] }>();
    const prose = chapters.chapters.at(-1)?.prose;
    expect(prose?.traceId).toBe(traceId);
    expect(prose?.paragraphs).toEqual(stored.paragraphs);
    expect(prose?.provider).toBe(stored.attempts.at(-1)?.provider);
    expect(chapter.rendering).toMatchObject({ status: stored.status, provider: prose?.provider });
  });
});

describe('without a durable request start', () => {
  it('answers with no trace ID, dispatches nothing, and cannot seed authoring', async () => {
    const unreachable = new pg.Pool({
      connectionString: 'postgres://ltw:x@127.0.0.1:1/none',
      max: 1,
    });
    closers.push(() => unreachable.end());
    let issued = '';
    const { app, calls, secret } = await rig({
      journalPool: unreachable,
      patch: (gateway) => ({
        ...gateway,
        ids: {
          next: () => {
            issued ||= gateway.ids.next();
            return issued;
          },
        },
      }),
    });
    const response = await intent(app);
    expect(response).toEqual({
      traceId: null,
      status: 'AI_UNAVAILABLE',
      proposal: null,
      issues: [],
      committable: false,
    });
    expect(calls).toHaveLength(0);
    expect(secret.reveals).toBe(0);
    const authoring = await post(
      app,
      '/campaigns/ravenford/authoring/proposals',
      { traceId: null },
      TOKENS.dm,
    );
    expect(authoring.statusCode).toBe(400);
    // The internal request ID was never persisted: on a working journal the normal read is a
    // plain 404 and the diagnostic invents nothing.
    expect(issued).not.toBe('');
    const reader = await rig();
    const read = await trace(reader.app, issued);
    expect(read.statusCode).toBe(404);
    expect(read.json()).not.toHaveProperty('traceId');
    expect((await diagnostic(reader.app, issued)).statusCode).toBe(404);
  });
});

describe('a stalled admission', () => {
  it('denies as unavailable before the caller expires, switches to local and keeps the trace ID', async () => {
    const policy = await holdLock(db.database.url, POLICY_LOCK_KEY, 'exclusive');
    closers.push(() => policy.release());
    const { app, calls, secret } = await rig({ requestTimeoutMs: 7_000 });
    const response = await intent(app);
    expect(response.status).toBe('PROPOSED');
    const traceId = response.traceId ?? '';
    const stored = (await trace(app, traceId)).json<{
      attempts: { provider: string; error: string | null }[];
    }>();
    expect(stored.attempts.map((a) => [a.provider, a.error])).toEqual([
      ['anthropic', 'ADMISSION_UNAVAILABLE'],
      ['local', null],
    ]);
    expect(calls).toHaveLength(0);
    expect(secret.reveals).toBe(0);
  }, 15_000);

  it('at whole-request expiry runs nothing more, not even locally', async () => {
    const policy = await holdLock(db.database.url, POLICY_LOCK_KEY, 'exclusive');
    closers.push(() => policy.release());
    const { app, calls } = await rig({ relevanceBudgetMs: 400 });
    const ranked = (
      await get(
        app,
        '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
        TOKENS.player,
      )
    ).json<EntityContextResponse>();
    expect(ranked.ranking).toMatchObject({ source: 'deterministic', status: 'TIMEOUT' });
    expect(ranked.ranking.traceId).not.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('a use case that rejects after an admitted invocation', () => {
  it('leaves its settled attempt and a durable start that recovery records as incomplete', async () => {
    let issued = '';
    const { app, gateway } = await rig({
      requestTimeoutMs: 1_000,
      patch: (inner) => ({
        ...inner,
        ids: {
          next: () => {
            const id = inner.ids.next();
            issued ||= id;
            return id;
          },
        },
        clock: {
          nowMs: inner.clock.nowMs,
          now: () => {
            throw new Error('clock failed while freezing');
          },
        },
      }),
    });
    const response = await post(
      app,
      '/campaigns/ravenford/ai/intents',
      { text: 'Advance time by 1 hour.' },
      TOKENS.dm,
    );
    expect(response.statusCode).toBe(500);
    await gateway.accounting.idle();
    expect((await diagnostic(app, issued)).json()).toMatchObject({
      lifecycle: 'pending',
      attempts: [{ accounting: 'settled', effectiveMicros: '3396' }],
    });
    await sleep(1_000 + FINALIZER_GRACE_MS + 200);
    expect(await recoverRequest(db.pool, issued)).toBe('recovered');
    expect((await diagnostic(app, issued)).json()).toMatchObject({
      lifecycle: 'recovered_incomplete',
    });
    expect((await trace(app, issued)).statusCode).toBe(404);
  }, 15_000);
});
