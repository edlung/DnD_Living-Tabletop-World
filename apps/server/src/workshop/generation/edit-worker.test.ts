import { randomUUID } from 'node:crypto';

import { buildCampaignEditPlan } from '@ltw/domain';

import { describe, expect, it } from 'vitest';

import { editFixture } from '../../testing/generation/edit-fixture.ts';
import { campaignEditPrompt } from './edit-prompt.ts';
import { digest } from './postgres-rows.ts';
import { CampaignEditWorker } from './edit-worker.ts';
import type { CampaignPreparationRuntime, PreparedCampaignRun } from './runtime.ts';

async function rig() {
  const f = await editFixture(),
    scope = await f.enqueue();
  const calls: Parameters<PreparedCampaignRun['run']>[0][] = [];
  let before: ((input: Parameters<PreparedCampaignRun['run']>[0]) => Promise<void>) | undefined;
  const output = structuredClone(f.content);
  output.world.opening = 'The bell rings urgently.';
  const preparation: CampaignPreparationRuntime = {
    availability: (ownerId) => f.preparation.availability(ownerId),
    forJob: () =>
      Promise.resolve({
        provider: 'test',
        model: 'same-approved-model',
        run: async (input) => {
          calls.push(input);
          await before?.(input);
          const checked = input.validate(output);
          return checked.ok
            ? {
                status: 'GENERATED',
                value: checked.value,
                traceId: input.traceId,
                provider: 'test',
                model: 'same-approved-model',
                issues: [],
                attempts: [],
              }
            : {
                status: 'INVALID_OUTPUT',
                value: null,
                traceId: input.traceId,
                provider: 'test',
                model: 'same-approved-model',
                issues: checked.issues,
                attempts: [],
              };
        },
      }),
  };
  const worker = new CampaignEditWorker({ repository: f.edit, preparation, packages: f.revisions });
  return {
    ...f,
    scope,
    calls,
    output,
    worker,
    preparation,
    beforeRun: (hook: typeof before) => {
      before = hook;
    },
  };
}
describe('candidate-only edit worker', () => {
  it('runs exactly the edit stage, validates full output and keeps baseline revision unchanged', async () => {
    const f = await rig();
    await f.worker.run(f.scope);
    expect(f.calls.map((call) => call.stage)).toEqual(['edit']);
    expect((await f.edit.get(f.scope))?.status).toBe('SUCCEEDED');
    expect((await f.edit.get(f.scope))?.attachedRevision).toBeNull();
    expect((await f.edit.candidate(f.scope))?.content).toEqual(f.output);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
    expect(digest((await f.edit.steps(f.scope))[0]?.prompt)).toBe(
      digest(JSON.stringify(campaignEditPrompt(f.base.content, f.spec))),
    );
    await f.worker.run(f.scope);
    expect(f.calls).toHaveLength(1);
  });
  it('resumes exact persisted payload and trace after a prepared lease expires', async () => {
    const f = await rig(),
      claim = await f.edit.claim(f.scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    const payload = { ...campaignEditPrompt(f.content, f.spec), system: 'EXACT_OLDER_TEMPLATE' },
      traceId = randomUUID();
    await f.edit.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.content,
      prompt: JSON.stringify(payload),
      provider: 'test',
      model: 'same-approved-model',
      traceId,
    });
    f.advance(30001);
    await f.worker.run(f.scope);
    expect(f.calls[0]).toMatchObject({ ...payload, traceId, stage: 'edit' });
    expect((await f.edit.get(f.scope))?.status).toBe('SUCCEEDED');
  });
  it('reuses saved completion after a lost commit acknowledgement without dispatching again', async () => {
    const f = await rig(),
      complete = f.edit.completeStep.bind(f.edit);
    let first = true;
    f.edit.completeStep = async (...args) => {
      const result = await complete(...args);
      if (first) {
        first = false;
        throw new Error('ACK_LOST');
      }
      return result;
    };
    await f.worker.run(f.scope);
    expect(await f.edit.get(f.scope)).toMatchObject({ status: 'RUNNING', nextStep: 1 });
    f.advance(30001);
    await f.worker.run(f.scope);
    expect((await f.edit.get(f.scope))?.status).toBe('SUCCEEDED');
    expect(f.calls).toHaveLength(1);
    expect((await f.edit.candidate(f.scope))?.content).toEqual(f.output);
  });
  it('refuses outside-scope output without saving an artifact or candidate', async () => {
    const f = await rig();
    f.output.brief.intent = 'Unrequested replacement';
    await f.worker.run(f.scope);
    expect((await f.edit.get(f.scope))?.status).toBe('FAILED');
    expect((await f.edit.get(f.scope))?.failureCode).toBe('INVALID_OUTPUT');
    expect(await f.edit.candidate(f.scope)).toBeNull();
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
  });
  it.each(['cancel', 'revoke'] as const)('fences late output after owner %s', async (action) => {
    const f = await rig();
    f.beforeRun(async () => {
      if (action === 'cancel') await f.edit.cancel(f.scope);
      else {
        for (const session of f.workshop.sessions.values())
          if (session.sessionId === f.sessionId)
            session.revokedAt = new Date(f.now()).toISOString();
      }
    });
    await f.worker.run(f.scope);
    expect(await f.edit.candidate(f.scope)).toBeNull();
    expect((await f.edit.steps(f.scope))[0]?.content).toBeNull();
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.digest).toBe(f.base.digest);
  });
  it('rejects a late provider result that ignores worker cancellation', async () => {
    const f = await rig();
    f.beforeRun(() => {
      f.worker.cancel(f.scope.jobId);
      return Promise.resolve();
    });
    await f.worker.run(f.scope);
    expect(await f.edit.get(f.scope)).toMatchObject({
      status: 'FAILED',
      failureCode: 'WORKER_ABORTED',
    });
    expect(await f.edit.candidate(f.scope)).toBeNull();
    expect((await f.edit.steps(f.scope))[0]?.content).toBeNull();
  });
  it('classifies schema-valid oversized edit output as invalid before artifact persistence', async () => {
    const f = await editFixture();
    const spec = buildCampaignEditPlan(f.base, f.locks, f.manifest, 'Extend notes', [
      'section:firstSession',
      'section:laterOutline',
    ]).spec;
    if (!spec) throw new Error('spec absent');
    const queued = await f.edit.enqueueEdit({ ...f.input, editSpec: spec });
    if (queued.kind !== 'saved') throw new Error('edit absent');
    const scope = { ownerId: f.ownerId, draftId: f.draftId, jobId: queued.job.jobId };
    const output = structuredClone(f.base.content);
    output.firstSession = Array.from({ length: 100 }, () => 'x'.repeat(3990));
    output.laterOutline = [...output.firstSession];
    let issues: readonly string[] = [];
    const preparation: CampaignPreparationRuntime = {
      availability: (ownerId) => f.preparation.availability(ownerId),
      forJob: () =>
        Promise.resolve({
          provider: 'test',
          model: 'test',
          run: (input) => {
            const result = input.validate(output);
            if (!result.ok) issues = result.issues;
            return Promise.resolve({
              status: 'INVALID_OUTPUT',
              value: null,
              traceId: input.traceId,
              provider: 'test',
              model: 'test',
              issues,
              attempts: [],
            });
          },
        }),
    };
    await new CampaignEditWorker({ repository: f.edit, preparation, packages: f.revisions }).run(
      scope,
    );
    expect(issues).toEqual(['CAMPAIGN_PACKAGE_TOO_LARGE']);
    expect(await f.edit.get(scope)).toMatchObject({
      status: 'FAILED',
      failureCode: 'INVALID_OUTPUT',
    });
    expect((await f.edit.steps(scope))[0]?.content).toBeNull();
    expect(await f.edit.candidate(scope)).toBeNull();
  });
});
