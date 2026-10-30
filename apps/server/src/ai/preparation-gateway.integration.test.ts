import { randomUUID } from 'node:crypto';

import { CAMPAIGN_GENERATION_STAGES, campaignPackageSchema } from '@ltw/contracts';
import { seedCampaignPackage } from '@ltw/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../auth/tokens.ts';
import { Secret, loadConfig } from '../platform/config/config.ts';
import { TEST_AUTH, accountingDb, seedApproval, type AccountingDb } from '../testing/accounting.ts';
import { emptyCampaignPackage } from '../testing/campaign-packages.ts';
import { FIXTURE_CATALOG } from '../testing/catalog-fixtures.ts';
import { fakeFetch, jsonResponse, hanging, type FetchCall } from '../testing/fake-fetch.ts';
import { ANTHROPIC } from '../testing/raw-adapter-fixtures.ts';
import { PostgresWorkshopStore } from '../workshop/postgres-store.ts';
import { PostgresCampaignGenerationRepository } from '../workshop/generation/postgres-store.ts';
import { CampaignGenerationWorker } from '../workshop/generation/worker.ts';
import { PostgresCampaignRevisionRepository } from '../workshop/packages/postgres-store.ts';
import { assessCampaignRevision } from '../workshop/packages/compiler.ts';
import { specimenOutput } from '../testing/generation/fixture.ts';
import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import type { GenerationLease } from '../workshop/generation/store.ts';
import { AccountingTasks } from './accounting-tasks.ts';
import { deadlineIn } from './accounting/deadline.ts';
import { setMonetaryPolicy } from './accounting/monetary-policy.ts';
import {
  grantPreparationApproval,
  openPreparationSession,
} from './accounting/preparation-sessions.ts';
import { PostgresBudgetStore } from './accounting/postgres-budget-store.ts';
import { startRequest } from './accounting/request-journal.ts';
import { identityResolver } from './catalog.ts';
import { createCampaignPreparationRuntime } from './preparation-gateway.ts';
import { PostgresAiTraceStore } from './postgres-trace-store.ts';

let db: AccountingDb;
let ownerId: string, draftId: string, authSessionId: string, authHash: string;
let workshop: PostgresWorkshopStore;
let repository: PostgresCampaignGenerationRepository;
let lease: GenerationLease;
beforeEach(async () => {
  db = await accountingDb();
  workshop = new PostgresWorkshopStore(db.pool);
  repository = new PostgresCampaignGenerationRepository(db.pool);
  ownerId = randomUUID();
  draftId = randomUUID();
  authSessionId = randomUUID();
  authHash = hashToken(newToken());
  const invitationHash = hashToken(newToken());
  const now =
    (await db.pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]?.now ??
    new Date();
  const createdAt = now.toISOString(),
    expiresAt = new Date(now.getTime() + 86400000).toISOString();
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash: invitationHash,
    createdAt,
    expiresAt,
    authorizationSource: 'test:preparation',
  });
  await workshop.redeem(
    invitationHash,
    { sessionId: authSessionId, tokenHash: authHash, createdAt, expiresAt },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    createdAt,
  );
  const enqueued = await repository.enqueue({
    ownerId,
    draftId,
    authSessionId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    seed: emptyCampaignPackage(),
  });
  if (enqueued.kind !== 'saved') throw new Error('fixture enqueue failed');
  const claimed = await repository.claim(
    { ownerId, draftId, jobId: enqueued.job.jobId },
    randomUUID(),
  );
  if (claimed.kind !== 'claimed') throw new Error('fixture claim failed');
  lease = claimed.lease;
  await seedApproval(db, { approvalId: 'a1' });
  await setMonetaryPolicy(db.pool, {
    scope: 'text',
    accountId: 'acct',
    mode: 'UNLIMITED',
    authorization: TEST_AUTH,
  });
});
afterEach(async () => db.close());

async function grant() {
  await grantPreparationApproval(db.pool, {
    approvalId: 'a1',
    ownerId,
    enabled: true,
    authorization: TEST_AUTH,
  });
}
const validate = (value: unknown) => {
  const checked = campaignPackageSchema.safeParse(value);
  return checked.success
    ? { ok: true as const, value: checked.data }
    : { ok: false as const, issues: ['INVALID_PACKAGE'] };
};
const payload = () => ({
  traceId: randomUUID(),
  stage: 'concept' as const,
  system: 'Static preparation instructions.',
  prompt: 'PRIVATE_BRIEF_ONLY_IN_USER_PROMPT',
  output: { name: 'campaign_step', description: 'A campaign step', schema: { type: 'object' } },
  signal: new AbortController().signal,
  validate,
});

function rig(respond?: (call: FetchCall) => Response | Promise<Response>, enabled = true) {
  const transport = fakeFetch(
    respond ??
      (() =>
        jsonResponse(
          ANTHROPIC.reply({
            tool: 'campaign_step',
            model: 'claude-sonnet-5-5',
            output: emptyCampaignPackage(),
          }),
        )),
  );
  const tasks = new AccountingTasks();
  const config = {
    ...loadConfig({}).ai,
    approvalId: 'a1',
    routes: enabled ? { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] } : {},
    anthropic: { apiKey: new Secret('test-not-real'), model: 'claude-sonnet-5-5', timeoutMs: 1000 },
    requestTimeoutMs: 3000,
    preparationTimeoutMs: 3000,
  };
  const runtime = createCampaignPreparationRuntime(config, {
    pool: db.pool,
    budget: new PostgresBudgetStore(db.pool, identityResolver(FIXTURE_CATALOG)),
    catalog: FIXTURE_CATALOG,
    approvalStored: true,
    tasks,
    fetch: transport.fetchImpl,
  });
  return { runtime, tasks, calls: transport.calls };
}

describe('workshop preparation with real journal and admitted provider', () => {
  it('runs all seven steps through PostgreSQL, the real worker and gateway, then replays without another dispatch', async () => {
    await repository.cancel(lease);
    await grant();
    const specimen = bellCampaign();
    const enqueued = await repository.enqueue({
      ownerId,
      draftId,
      authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      seed: seedCampaignPackage({
        title: specimen.world.name,
        language: specimen.world.language,
        brief: specimen.brief,
      }),
    });
    if (enqueued.kind !== 'saved') throw new Error('pipeline job missing');
    const scope = { ownerId, draftId, jobId: enqueued.job.jobId };
    const stages: string[] = [];
    const { runtime, tasks, calls } = rig((call) => {
      const body = JSON.parse(call.body) as { tools: { name: string }[] };
      const tool = body.tools[0]?.name;
      const stage = CAMPAIGN_GENERATION_STAGES.find(
        (candidate) => tool === `prepare_campaign_${candidate.replaceAll('-', '_')}`,
      );
      if (!stage || !tool) throw new Error('unexpected preparation tool');
      stages.push(stage);
      return jsonResponse(
        ANTHROPIC.reply({
          tool,
          model: 'claude-sonnet-5-5',
          output: specimenOutput(stage, specimen),
        }),
      );
    });
    await new CampaignGenerationWorker({ repository, preparation: runtime }).run(scope);
    await tasks.idle();
    expect(stages).toEqual(CAMPAIGN_GENERATION_STAGES);
    expect(calls).toHaveLength(7);
    expect(await repository.get(scope)).toMatchObject({
      status: 'SUCCEEDED',
      nextStep: 7,
      attachedRevision: 1,
    });
    const revision = await new PostgresCampaignRevisionRepository(db.pool).latest(ownerId, draftId);
    if (!revision) throw new Error('generated revision missing');
    expect(revision.content).toEqual(specimen);
    expect(revision.source).toMatchObject({
      kind: 'AI',
      jobId: scope.jobId,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    expect(await assessCampaignRevision(revision, ownerId)).toMatchObject({ readiness: 'READY' });
    const steps = await repository.steps(scope);
    expect(steps).toHaveLength(7);
    for (const step of steps) {
      expect(step).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
      });
      expect(step.content).not.toBeNull();
      expect(await runtime.trace?.(ownerId, draftId, step.traceId)).toMatchObject({
        traceId: step.traceId,
        purpose: 'campaign-preparation',
        jobId: scope.jobId,
        stage: step.stage,
        subject: { kind: 'workshop', ownerId, draftId },
      });
    }
    for (const table of ['ltw_ai_requests', 'ltw_ai_attempts']) {
      const rows = await db.pool.query<{ campaign_id: string | null; session_class: string }>(
        `SELECT campaign_id, session_class FROM ${table}`,
      );
      expect(rows.rows).toHaveLength(7);
      expect(
        rows.rows.every((row) => row.campaign_id === null && row.session_class === 'preparation'),
      ).toBe(true);
    }
    expect(
      (await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM ltw_event_streams'))
        .rows[0]?.n,
    ).toBe('0');
    await new CampaignGenerationWorker({ repository, preparation: runtime }).run(scope);
    expect(calls).toHaveLength(7);
    expect(
      (await new PostgresCampaignRevisionRepository(db.pool).latest(ownerId, draftId))?.digest,
    ).toBe(revision.digest);
  });

  it('requires both a configured route and explicit owner preparation grant', async () => {
    const { runtime, calls } = rig();
    expect(await runtime.availability(ownerId)).toMatchObject({
      available: false,
      reason: 'NO_PREPARATION_GRANT',
    });
    expect(await runtime.forJob(lease)).toBeNull();
    await grant();
    expect(await runtime.availability(ownerId)).toMatchObject({ available: true, reason: 'READY' });
    expect(await rig(undefined, false).runtime.availability(ownerId)).toMatchObject({
      available: false,
      reason: 'NO_ROUTE',
    });
    expect(calls).toHaveLength(0);
  });

  it('records genuine workshop session/subject, settles usage and never creates a campaign', async () => {
    await grant();
    const { runtime, tasks, calls } = rig();
    const prepared = await runtime.forJob(lease);
    if (!prepared) throw new Error('not prepared');
    const input = payload();
    const result = await prepared.run(input);
    await tasks.idle();
    expect(result).toMatchObject({
      status: 'GENERATED',
      traceId: input.traceId,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    expect(calls).toHaveLength(1);
    const rows = await db.pool.query<{
      campaign_id: string | null;
      session_class: string;
      subject_kind: string;
      workshop_owner_id: string;
      workshop_draft_id: string;
    }>(
      'SELECT campaign_id,session_class,subject_kind,workshop_owner_id,workshop_draft_id FROM ltw_ai_requests',
    );
    expect(rows.rows).toEqual([
      {
        campaign_id: null,
        session_class: 'preparation',
        subject_kind: 'workshop',
        workshop_owner_id: ownerId,
        workshop_draft_id: draftId,
      },
    ]);
    expect(
      (await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM ltw_event_streams'))
        .rows[0]?.n,
    ).toBe('0');
    expect(
      (await db.pool.query<{ kind: string }>('SELECT kind FROM ltw_ai_accounting')).rows,
    ).toEqual([{ kind: 'settled' }]);
    expect(await runtime.trace?.(ownerId, draftId, input.traceId)).toMatchObject({
      purpose: 'campaign-preparation',
      campaignId: null,
      subject: { kind: 'workshop', ownerId, draftId },
    });
    expect(await runtime.trace?.(randomUUID(), draftId, input.traceId)).toBeNull();
    expect(await new PostgresAiTraceStore(db.pool).get(draftId, input.traceId)).toBeNull();
    expect(calls[0]?.body).not.toContain(ownerId);
    expect(calls[0]?.body).not.toContain(draftId);
    const body = JSON.parse(calls[0]?.body ?? '{}') as { system: unknown; max_tokens: number };
    expect(JSON.stringify(body.system)).not.toContain(input.prompt);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it.each(['cancel', 'revoke', 'fence', 'expiry'] as const)(
    'rechecks %s before a request can dispatch',
    async (change) => {
      await grant();
      const { runtime, calls } = rig();
      const prepared = await runtime.forJob(lease);
      if (!prepared) throw new Error('not prepared');
      if (change === 'cancel') await repository.cancel(lease);
      if (change === 'revoke')
        await workshop.revokeOwner(ownerId, new Date().toISOString(), 'test:revoke');
      if (change === 'fence')
        await db.pool.query(
          'UPDATE ltw_campaign_generation_jobs SET fence=fence+1 WHERE job_id=$1',
          [lease.jobId],
        );
      if (change === 'expiry')
        await db.pool.query(
          "UPDATE ltw_campaign_generation_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
          [lease.jobId],
        );
      expect(await prepared.run(payload())).toMatchObject({
        status: 'AI_UNAVAILABLE',
        value: null,
        traceId: null,
      });
      expect(calls).toHaveLength(0);
    },
  );

  it('rejects foreign owner/draft leases, disabled grants and finite policy', async () => {
    await grant();
    const { runtime, calls } = rig();
    expect(await runtime.forJob({ ...lease, ownerId: randomUUID() })).toBeNull();
    expect(await runtime.forJob({ ...lease, draftId: randomUUID() })).toBeNull();
    await grantPreparationApproval(db.pool, {
      approvalId: 'a1',
      ownerId,
      enabled: false,
      authorization: TEST_AUTH,
    });
    expect(await runtime.forJob(lease)).toBeNull();
    await grant();
    await setMonetaryPolicy(db.pool, {
      scope: 'text',
      accountId: 'acct',
      mode: 'FINITE',
      authorization: TEST_AUTH,
    });
    expect(await runtime.availability(ownerId)).toMatchObject({ available: false });
    expect(calls).toHaveLength(0);
  });

  it('cannot disguise preparation as play/evaluation or use a prep session for old reasoning', async () => {
    await grant();
    const sessionId = await openPreparationSession(db.pool, lease, 'a1');
    if (!sessionId) throw new Error('no preparation session');
    const base = {
      requestId: randomUUID(),
      campaignId: null,
      subject: { kind: 'workshop' as const, ownerId, draftId },
      actorId: ownerId,
      purpose: 'campaign-preparation',
      capability: 'campaign-preparation',
      scope: 'WORKSHOP',
      sourceIds: [lease.jobId],
      approvalId: 'a1',
      configuredModel: 'claude-sonnet-5-5',
    };
    expect(
      await startRequest(
        db.pool,
        { ...base, session: { class: 'play', sessionId } },
        deadlineIn(5000),
      ),
    ).toMatchObject({ status: 'failed' });
    expect(
      await startRequest(
        db.pool,
        { ...base, requestId: randomUUID(), session: { class: 'evaluation', runId: sessionId } },
        deadlineIn(5000),
      ),
    ).toMatchObject({ status: 'failed' });
    expect(
      await startRequest(
        db.pool,
        {
          ...base,
          requestId: randomUUID(),
          capability: 'reasoning',
          session: { class: 'preparation', sessionId },
        },
        deadlineIn(5000),
      ),
    ).toMatchObject({ status: 'failed' });
  });

  it('repairs invalid output once on the same admitted provider', async () => {
    await grant();
    let calls = 0;
    const { runtime, tasks } = rig(() =>
      jsonResponse(
        ANTHROPIC.reply({
          tool: 'campaign_step',
          model: 'claude-sonnet-5-5',
          output: ++calls === 1 ? { bad: true } : emptyCampaignPackage(),
        }),
      ),
    );
    const prepared = await runtime.forJob(lease);
    if (!prepared) throw new Error('not prepared');
    const result = await prepared.run(payload());
    await tasks.idle();
    expect(result.status).toBe('GENERATED');
    expect(calls).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.map((attempt) => attempt.kind)).toEqual(['initial', 'repair']);
  });

  it('retains an unknown hold when an in-flight provider is cancelled', async () => {
    await grant();
    const { runtime, tasks, calls } = rig(hanging);
    const prepared = await runtime.forJob(lease);
    if (!prepared) throw new Error('not prepared');
    const controller = new AbortController();
    const pending = prepared.run({ ...payload(), signal: controller.signal });
    for (let i = 0; i < 100 && calls.length === 0; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls).toHaveLength(1);
    controller.abort();
    expect(await pending).toMatchObject({ status: 'DISPATCH_UNKNOWN', value: null });
    await tasks.idle();
    expect(
      (await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM ltw_ai_attempts'))
        .rows[0]?.n,
    ).toBe('1');
    expect(
      (await db.pool.query<{ n: string }>('SELECT count(*)::text AS n FROM ltw_ai_accounting'))
        .rows[0]?.n,
    ).toBe('0');
  });
});
