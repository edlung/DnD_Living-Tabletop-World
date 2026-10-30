import { randomUUID } from 'node:crypto';

import type {
  CampaignEditingContext,
  CampaignEditPlanView,
  CampaignGenerationJob,
  CampaignPackage,
  CampaignRevision,
  CampaignRevisionReview,
  CampaignRevisionView,
} from '@ltw/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { setMonetaryPolicy } from '../../ai/accounting/monetary-policy.ts';
import { grantPreparationApproval } from '../../ai/accounting/preparation-sessions.ts';
import { PostgresBudgetStore } from '../../ai/accounting/postgres-budget-store.ts';
import { identityResolver } from '../../ai/catalog.ts';
import { createCampaignPreparationRuntime } from '../../ai/preparation-gateway.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { Secret, loadConfig } from '../../platform/config/config.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import {
  TEST_AUTH,
  accountingDb,
  seedApproval,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { FIXTURE_CATALOG } from '../../testing/catalog-fixtures.ts';
import { fakeFetch, jsonResponse } from '../../testing/fake-fetch.ts';
import { englishBellCampaign } from '../../testing/generation/bell-english.ts';
import { ANTHROPIC } from '../../testing/raw-adapter-fixtures.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { createWorldEngine } from '../../world-engine/runtime.ts';
import { PostgresDraftImageRepository } from '../images/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../packages/postgres-store.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../revisions/postgres-store.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../service.ts';
import { CampaignEditWorker } from './edit-worker.ts';
import { PostgresCampaignGenerationRepository } from './postgres-store.ts';

const ORIGIN = 'https://table.example';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const cookieOf = (response: LightMyRequestResponse) => {
  const raw = response.headers['set-cookie'];
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
};

async function setup() {
  const db = await accountingDb();
  cleanup.push(() => db.close());
  const store = new PostgresWorkshopStore(db.pool),
    packages = new PostgresCampaignRevisionRepository(db.pool);
  const images = new PostgresDraftImageRepository(db.pool),
    controls = new PostgresCampaignRevisionControlRepository(db.pool);
  const repository = new PostgresCampaignGenerationRepository(db.pool, 'EDIT'),
    generation = new PostgresCampaignGenerationRepository(db.pool);
  const observer = db.pool2(),
    tasks = new AccountingTasks();
  let jobId: string | null = null,
    proposal: CampaignPackage | null = null;
  const transport = fakeFetch(async (call) => {
    if (!jobId || !proposal) throw new Error('TEST_INPUT_NOT_READY');
    const markers = await observer.query<{ mode: string; status: string }>(
      `SELECT j.mode,j.status FROM ltw_campaign_generation_dispatches d JOIN ltw_campaign_generation_jobs j USING(owner_id,draft_id,job_id) WHERE d.job_id=$1`,
      [jobId],
    );
    expect(markers.rows).toEqual([{ mode: 'EDIT', status: 'RUNNING' }]);
    const requests = await observer.query<{
      campaign_id: null;
      subject_kind: string;
      session_class: string;
    }>('SELECT campaign_id,subject_kind,session_class FROM ltw_ai_requests');
    expect(requests.rows).toEqual([
      { campaign_id: null, subject_kind: 'workshop', session_class: 'preparation' },
    ]);
    expect((JSON.parse(call.body) as { tools: { name: string }[] }).tools[0]?.name).toBe(
      'prepare_campaign_edit',
    );
    return jsonResponse(
      ANTHROPIC.reply({
        tool: 'prepare_campaign_edit',
        model: 'claude-sonnet-5-5',
        output: proposal,
      }),
    );
  });
  const preparation = createCampaignPreparationRuntime(
    {
      ...loadConfig({}).ai,
      approvalId: 'a1',
      routes: { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] },
      anthropic: {
        apiKey: new Secret('test-not-real'),
        model: 'claude-sonnet-5-5',
        timeoutMs: 5000,
      },
      requestTimeoutMs: 8000,
      preparationTimeoutMs: 8000,
    },
    {
      pool: db.pool,
      budget: new PostgresBudgetStore(db.pool, identityResolver(FIXTURE_CATALOG)),
      catalog: FIXTURE_CATALOG,
      approvalStored: true,
      tasks,
      fetch: transport.fetchImpl,
    },
  );
  const edits = { repository, preparation },
    worker = new CampaignEditWorker({ ...edits, packages });
  const workshop: WorkshopDependencies = {
    store,
    packages,
    revisionControls: controls,
    edits,
    cancelEdit: (id) => {
      worker.cancel(id);
    },
    generation: { repository: generation, preparation },
    images: {
      repository: images,
      runtime: {
        availability: () =>
          Promise.resolve({ available: false, reason: 'NO_ROUTE', provider: null, model: null }),
        prepare: () => Promise.resolve({ status: 'UNAVAILABLE', reason: 'NO_ROUTE' }),
        forJob: () => Promise.resolve(null),
      },
    },
    publicOrigin: ORIGIN,
    clock: { now: Date.now },
    limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, Date.now),
  };
  const app = buildApp({
    engine: createWorldEngine(db.pool),
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'edit-http-pg', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop,
  });
  cleanup.push(() => app.close());
  await app.ready();
  const authenticate = async (ownerId: string) => {
    const invite = await issueWorkshopInvitation(workshop, {
      ownerId,
      hours: 1,
      authorizationSource: 'test:430-http',
    });
    const token = invite.link.split('#')[1];
    if (!token) throw new Error('invite absent');
    const response = await app.inject({
      method: 'POST',
      url: '/workshop/auth/redeem',
      headers: { origin: ORIGIN },
      payload: { token },
    });
    expect(response.statusCode).toBe(200);
    return cookieOf(response);
  };
  const ownerId = randomUUID(),
    cookie = await authenticate(ownerId);
  const send = (
    method: 'GET' | 'POST',
    url: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie, 'x-workshop-owner': ownerId, ...headers },
      ...(payload ? { payload } : {}),
    });
  const created = await send('POST', '/workshop/drafts', {
    requestId: randomUUID(),
    title: 'Independent edit pipeline',
    language: 'en',
  });
  expect(created.statusCode).toBe(200);
  const draftId = created.json<{ draftId: string }>().draftId,
    url = `/workshop/drafts/${draftId}`;
  const saved = await send('POST', `${url}/revisions`, {
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: englishBellCampaign(),
  });
  expect(saved.statusCode).toBe(200);
  const initial = saved.json<CampaignRevisionView>();
  expect(initial.assessment.readiness).toBe('READY');
  const base = initial.revision;
  if (!base) throw new Error('baseline absent');
  await seedApproval(db, { approvalId: 'a1' });
  await setMonetaryPolicy(db.pool, {
    scope: 'text',
    accountId: 'acct',
    mode: 'UNLIMITED',
    authorization: TEST_AUTH,
  });
  await grantPreparationApproval(db.pool, {
    approvalId: 'a1',
    ownerId,
    enabled: true,
    authorization: TEST_AUTH,
  });
  const contextResponse = await send('GET', `${url}/editing`);
  expect(contextResponse.statusCode).toBe(200);
  const context = contextResponse.json<CampaignEditingContext>();
  const request = {
    requestId: randomUUID(),
    revision: base.revision,
    packageDigest: base.digest,
    expectedLockVersion: context.locks.version,
    manifestVersion: context.manifest.version,
    manifestDigest: context.manifest.digest,
    instruction: 'Make the opening urgent.',
    targets: ['section:world'],
  };
  const generate = async () => {
    const { requestId, ...plan } = request;
    expect(requestId).toBeTruthy();
    const planned = await send('POST', `${url}/edits/plan`, plan);
    expect(planned.statusCode).toBe(200);
    expect(planned.json<CampaignEditPlanView>().spec?.requestedTargets).toEqual(['section:world']);
    const queued = await send('POST', `${url}/edits`, request);
    expect(queued.statusCode).toBe(200);
    const job = queued.json<{ job: CampaignGenerationJob }>().job;
    expect(job.mode).toBe('EDIT');
    jobId = job.jobId;
    proposal = structuredClone(base.content);
    proposal.world.opening += ' The river ice cracks before the warning bell can finish.';
    await worker.run({ ownerId, draftId, jobId });
    await tasks.idle();
    expect((await packages.latest(ownerId, draftId))?.revision).toBe(1);
    const response = await send('GET', `${url}/edits/${jobId}/review`);
    expect(response.statusCode).toBe(200);
    const review = response.json<CampaignRevisionReview>();
    expect(review).toMatchObject({
      kind: 'EDIT',
      sourceId: jobId,
      adoptable: true,
      assessment: { readiness: 'READY' },
      issues: [],
      conflicts: [],
    });
    return { jobId, review, body: adoptionBody(review) };
  };
  return {
    db,
    app,
    ownerId,
    draftId,
    url,
    base,
    context,
    request,
    worker,
    repository,
    packages,
    preparation,
    tasks,
    transport,
    send,
    authenticate,
    generate,
  };
}
function adoptionBody(review: CampaignRevisionReview) {
  return {
    requestId: randomUUID(),
    basedOnRevision: review.before.revision,
    packageDigest: review.before.digest,
    expectedLockVersion: review.locks.version,
    manifestVersion: review.manifest.version,
    manifestDigest: review.manifest.digest,
    reviewDigest: review.reviewDigest,
    candidateDigest: review.candidateDigest,
  };
}
async function noCanonicalEvents(db: AccountingDb) {
  for (const table of ['ltw_event_streams', 'ltw_commands', 'ltw_events'])
    expect(
      (await db.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]?.n,
    ).toBe('0');
}

describe('actual PostgreSQL private selective edit HTTP pipeline', () => {
  it('plans/enqueues through HTTP, dispatches an admitted edit, explicitly adopts and exactly replays a lost acknowledgement', async () => {
    const f = await setup(),
      result = await f.generate(),
      adopt = `${f.url}/edits/${result.jobId}/adopt`;
    expect(result.review.changes.some((change) => change.path.join('.') === 'world.opening')).toBe(
      true,
    );
    expect(f.transport.calls).toHaveLength(1);
    const progress = await f.send('GET', `${f.url}/edits/${result.jobId}/progress`);
    expect(progress.json()).toMatchObject({
      edit: { instruction: f.request.instruction, requestedTargets: ['section:world'] },
      job: { mode: 'EDIT', status: 'SUCCEEDED', attachedRevision: null, candidateAvailable: true },
    });
    const adopted = await f.send('POST', adopt, result.body);
    expect(adopted.statusCode).toBe(200);
    const revision = adopted.json<{ revision: CampaignRevision }>().revision;
    expect(revision).toMatchObject({
      revision: 2,
      basedOnRevision: 1,
      source: {
        kind: 'AI',
        jobId: result.jobId,
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
      },
    });
    expect(revision.identities).toEqual(f.base.identities);
    expect(revision.content.world.opening).toContain('river ice cracks');
    const nextContext = (await f.send('GET', `${f.url}/editing`)).json<CampaignEditingContext>();
    const lock = await f.send('POST', `${f.url}/locks`, {
      requestId: randomUUID(),
      revision: 2,
      packageDigest: revision.digest,
      expectedLockVersion: nextContext.locks.version,
      manifestVersion: nextContext.manifest.version,
      manifestDigest: nextContext.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:brief' }],
    });
    expect(lock.statusCode).toBe(200);
    // The first response is treated as lost: retry the exact immutable intent, never rewrite its CAS.
    const replay = await f.send('POST', adopt, result.body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(adopted.json());
    const rewritten = await f.send('POST', adopt, {
      ...result.body,
      basedOnRevision: 2,
      packageDigest: revision.digest,
    });
    expect(rewritten.statusCode).toBe(409);
    expect(rewritten.json()).toMatchObject({ conflict: { reason: 'REQUEST_REUSED' } });
    const otherId = randomUUID(),
      otherCookie = await f.authenticate(otherId);
    for (const [method, path, payload] of [
      ['GET', `${f.url}/edits/${result.jobId}/review`, undefined],
      ['POST', adopt, result.body],
    ] as const)
      expect(
        (await f.send(method, path, payload, { cookie: otherCookie, 'x-workshop-owner': otherId }))
          .statusCode,
      ).toBe(404);
    expect((await f.send('POST', adopt, result.body, { cookie: '' })).statusCode).toBe(401);
    const step = (await f.repository.steps({ ...f, jobId: result.jobId }))[0];
    expect(await f.preparation.trace?.(f.ownerId, f.draftId, step?.traceId ?? '')).toMatchObject({
      stage: 'edit',
      jobId: result.jobId,
      subject: { kind: 'workshop', ownerId: f.ownerId, draftId: f.draftId },
    });
    const paid = await f.db.pool.query<{ kind: string; charged: boolean }>(
      'SELECT kind,charge_micros>0 AS charged FROM ltw_ai_accounting',
    );
    expect(paid.rows).toEqual([{ kind: 'settled', charged: true }]);
    expect((await f.repository.get({ ...f, jobId: result.jobId }))?.attachedRevision).toBeNull();
    await f.worker.run({ ...f, jobId: result.jobId });
    expect(f.transport.calls).toHaveLength(1);
    expect((await f.packages.latest(f.ownerId, f.draftId))?.revision).toBe(2);
    await noCanonicalEvents(f.db);
  });
  it('rejects adoption after a lock race and retains the unattached candidate without another provider call', async () => {
    const f = await setup(),
      result = await f.generate();
    const lock = await f.send('POST', `${f.url}/locks`, {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.context.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    });
    expect(lock.statusCode).toBe(200);
    const rejected = await f.send('POST', `${f.url}/edits/${result.jobId}/adopt`, result.body);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ conflict: { reason: 'STALE_LOCKS' } });
    const updated = (
      await f.send('GET', `${f.url}/edits/${result.jobId}/review`)
    ).json<CampaignRevisionReview>();
    expect(updated.adoptable).toBe(false);
    expect(updated.conflicts).toMatchObject([
      { target: { kind: 'content', targetId: 'section:world' }, reason: 'CONTENT_CHANGED' },
    ]);
    const refreshed = await f.send(
      'POST',
      `${f.url}/edits/${result.jobId}/adopt`,
      adoptionBody(updated),
    );
    expect(refreshed.statusCode).toBe(409);
    expect(refreshed.json()).toMatchObject({ conflict: { reason: 'LOCKED_CONTENT' } });
    expect((await f.packages.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
    expect((await f.repository.candidate({ ...f, jobId: result.jobId }))?.contentDigest).toBe(
      result.review.candidateDigest,
    );
    expect(
      (
        await f.db.pool.query(
          "SELECT * FROM ltw_campaign_revision_write_receipts WHERE operation='ADOPTION'",
        )
      ).rowCount,
    ).toBe(0);
    expect(f.transport.calls).toHaveLength(1);
    await noCanonicalEvents(f.db);
  });
});
