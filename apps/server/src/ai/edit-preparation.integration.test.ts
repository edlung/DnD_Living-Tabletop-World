import { randomUUID } from 'node:crypto';

import { buildCampaignEditPlan } from '@ltw/domain';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Secret, loadConfig } from '../platform/config/config.ts';
import { TEST_AUTH, accountingDb, seedApproval, type AccountingDb } from '../testing/accounting.ts';
import { FIXTURE_CATALOG } from '../testing/catalog-fixtures.ts';
import { editPgFixture } from '../testing/generation/edit-pg-fixture.ts';
import { fakeFetch, jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import { ANTHROPIC } from '../testing/raw-adapter-fixtures.ts';
import { CampaignEditWorker } from '../workshop/generation/edit-worker.ts';
import { campaignEditPrompt } from '../workshop/generation/edit-prompt.ts';
import { AccountingTasks } from './accounting-tasks.ts';
import { setMonetaryPolicy } from './accounting/monetary-policy.ts';
import {
  grantPreparationApproval,
  openPreparationSession,
} from './accounting/preparation-sessions.ts';
import { PostgresBudgetStore } from './accounting/postgres-budget-store.ts';
import { identityResolver } from './catalog.ts';
import { createCampaignPreparationRuntime } from './preparation-gateway.ts';

let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});
async function fixture() {
  const f = await editPgFixture(db);
  await seedApproval(db, { approvalId: 'a1' });
  await setMonetaryPolicy(db.pool, {
    scope: 'text',
    accountId: 'acct',
    mode: 'UNLIMITED',
    authorization: TEST_AUTH,
  });
  await grantPreparationApproval(db.pool, {
    approvalId: 'a1',
    ownerId: f.ownerId,
    enabled: true,
    authorization: TEST_AUTH,
  });
  return f;
}
function rig(reply: (call: FetchCall) => Response | Promise<Response>) {
  const transport = fakeFetch(reply),
    tasks = new AccountingTasks();
  const runtime = createCampaignPreparationRuntime(
    {
      ...loadConfig({}).ai,
      approvalId: 'a1',
      routes: { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] },
      anthropic: { apiKey: new Secret('not-real'), model: 'claude-sonnet-5-5', timeoutMs: 3000 },
      requestTimeoutMs: 5000,
      preparationTimeoutMs: 5000,
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
  return { runtime, tasks, calls: transport.calls };
}
describe('selective edit through real admitted preparation gateway', () => {
  it('records one genuine workshop request and durable marker, then saves only a candidate with trace lineage', async () => {
    const f = await fixture(),
      scope = await f.enqueue();
    const output = structuredClone(f.base.content);
    output.world.opening = 'The bell rings urgently before dawn.';
    const { runtime, tasks, calls } = rig(async (call) => {
      const markers = await db.pool.query(
        'SELECT * FROM ltw_campaign_generation_dispatches WHERE job_id=$1',
        [scope.jobId],
      );
      expect(markers.rowCount).toBe(1);
      const rows = await db.pool.query<{
        campaign_id: null;
        subject_kind: string;
        session_class: string;
      }>('SELECT campaign_id,subject_kind,session_class FROM ltw_ai_requests');
      expect(rows.rows).toEqual([
        { campaign_id: null, subject_kind: 'workshop', session_class: 'preparation' },
      ]);
      const body = JSON.parse(call.body) as {
        tools: { name: string }[];
        messages: { content: unknown }[];
        system: unknown;
      };
      expect(body.tools[0]?.name).toBe('prepare_campaign_edit');
      expect(JSON.stringify(body.system)).not.toContain(f.base.content.world.opening);
      expect(JSON.stringify(body.messages)).toContain('Make the opening more urgent.');
      return jsonResponse(
        ANTHROPIC.reply({ tool: 'prepare_campaign_edit', model: 'claude-sonnet-5-5', output }),
      );
    });
    const worker = new CampaignEditWorker({
      repository: f.repository,
      preparation: runtime,
      packages: f.packages,
    });
    await worker.run(scope);
    await tasks.idle();
    expect(calls).toHaveLength(1);
    expect(await f.repository.get(scope)).toMatchObject({
      mode: 'EDIT',
      status: 'SUCCEEDED',
      nextStep: 1,
      attachedRevision: null,
    });
    const candidate = await f.repository.candidate(scope),
      steps = await f.repository.steps(scope);
    expect(candidate?.content).toEqual(output);
    expect(candidate?.source).toMatchObject({
      kind: 'AI',
      jobId: scope.jobId,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ stage: 'edit', status: 'SUCCEEDED', input: f.base.content });
    expect(await runtime.trace?.(f.ownerId, f.draftId, steps[0]?.traceId ?? '')).toMatchObject({
      purpose: 'campaign-preparation',
      jobId: scope.jobId,
      stage: 'edit',
      subject: { kind: 'workshop', ownerId: f.ownerId, draftId: f.draftId },
    });
    expect(await runtime.trace?.(randomUUID(), f.draftId, steps[0]?.traceId ?? '')).toBeNull();
    expect((await f.packages.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
    const attempts = await db.pool.query<{
      campaign_id: null;
      subject_kind: string;
      session_class: string;
    }>('SELECT campaign_id,subject_kind,session_class FROM ltw_ai_attempts');
    expect(attempts.rows).toEqual([
      { campaign_id: null, subject_kind: 'workshop', session_class: 'preparation' },
    ]);
    for (const table of ['ltw_event_streams', 'ltw_commands', 'ltw_events'])
      expect(
        (await db.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]?.n,
      ).toBe('0');
    await worker.run(scope);
    expect(calls).toHaveLength(1);
  });
  it('rejects wrong mode at session creation and stage dispatch without invoking transport', async () => {
    const f = await fixture(),
      scope = await f.enqueue();
    const claimed = await f.repository.claim(scope, randomUUID());
    if (claimed.kind !== 'claimed') throw new Error('lease absent');
    expect(
      await openPreparationSession(db.pool, { ...claimed.lease, mode: 'GENERATE' }, 'a1'),
    ).toBeNull();
    const { runtime, tasks, calls } = rig(() => {
      throw new Error('must not fetch');
    });
    expect(await runtime.forJob({ ...claimed.lease, mode: 'GENERATE' })).toBeNull();
    const run = await runtime.forJob(claimed.lease);
    if (!run) throw new Error('runner absent');
    const result = await run.run({
      ...campaignEditPrompt(f.base.content, f.spec),
      stage: 'concept',
      traceId: randomUUID(),
      signal: new AbortController().signal,
      validate: () => ({ ok: true, value: f.base.content }),
    });
    await tasks.idle();
    expect(result).toMatchObject({
      status: 'AI_UNAVAILABLE',
      issues: ['PREPARATION_MODE_STAGE_MISMATCH'],
    });
    expect(calls).toEqual([]);
    expect((await db.pool.query('SELECT * FROM ltw_ai_requests')).rowCount).toBe(0);
  });
  it('accounts a bounded repair when initial output violates edit scope, using the same approved route', async () => {
    const f = await fixture(),
      scope = await f.enqueue();
    const output = structuredClone(f.base.content);
    output.world.opening = 'The bell rings before dawn.';
    const invalid = structuredClone(output);
    invalid.brief.intent = 'Unauthorized outside-scope replacement';
    let count = 0;
    const { runtime, tasks, calls } = rig(() =>
      jsonResponse(
        ANTHROPIC.reply({
          tool: 'prepare_campaign_edit',
          model: 'claude-sonnet-5-5',
          output: ++count === 1 ? invalid : output,
        }),
      ),
    );
    await new CampaignEditWorker({
      repository: f.repository,
      preparation: runtime,
      packages: f.packages,
    }).run(scope);
    await tasks.idle();
    expect(calls).toHaveLength(2);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect((await f.repository.candidate(scope))?.content).toEqual(output);
    expect((await db.pool.query('SELECT * FROM ltw_ai_attempts')).rowCount).toBe(2);
    expect((await f.packages.latest(f.ownerId, f.draftId))?.revision).toBe(1);
  });
  it('fails an oversized prepared request honestly before transport without truncation or another route', async () => {
    const f = await fixture();
    const content = structuredClone(f.base.content);
    content.laterOutline = Array.from({ length: 100 }, (_, i) => `${i}:` + 'x'.repeat(3990));
    const saved = await f.packages.append({
      ownerId: f.ownerId,
      draftId: f.draftId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date().toISOString(),
    });
    if (saved.kind !== 'saved') throw new Error('large baseline absent');
    const manifest = await f.images.manifest(f, saved.revision.revision);
    if (!manifest) throw new Error('manifest absent');
    const spec = buildCampaignEditPlan(saved.revision, f.locks, manifest, 'Revise opening', [
      'section:world',
    ]).spec;
    if (!spec) throw new Error('spec absent');
    const queued = await f.repository.enqueueEdit({
      ...f.input,
      requestId: randomUUID(),
      basedOnRevision: saved.revision.revision,
      seed: saved.revision.content,
      editSpec: spec,
    });
    if (queued.kind !== 'saved') throw new Error('large edit absent');
    const scope = { ownerId: f.ownerId, draftId: f.draftId, jobId: queued.job.jobId };
    const { runtime, tasks, calls } = rig(() => {
      throw new Error('must not fetch');
    });
    await new CampaignEditWorker({
      repository: f.repository,
      preparation: runtime,
      packages: f.packages,
    }).run(scope);
    await tasks.idle();
    expect(calls).toEqual([]);
    expect(await f.repository.get(scope)).toMatchObject({
      status: 'FAILED',
      failureCode: 'AI_UNAVAILABLE',
      attachedRevision: null,
    });
    expect(await f.repository.candidate(scope)).toBeNull();
    const prompt = (await f.repository.steps(scope))[0]?.prompt ?? '';
    expect(prompt).toContain(content.laterOutline.at(-1));
    expect((await f.packages.latest(f.ownerId, f.draftId))?.digest).toBe(saved.revision.digest);
  });
});
