import { randomUUID } from 'node:crypto';

import { CAMPAIGN_GENERATION_STAGES } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { generationFixture, MODEL, PROVIDER, T0 } from '../../testing/generation/fixture.ts';
import { campaignPreparationPrompt } from './prompt.ts';
import { CampaignGenerationWorker } from './worker.ts';

const queued = async (fixture: Awaited<ReturnType<typeof generationFixture>>) => {
  const result = await fixture.enqueue();
  if (result.kind !== 'saved') throw new Error('test job absent');
  return { ownerId: fixture.ownerId, draftId: fixture.draftId, jobId: result.job.jobId };
};

describe('durable campaign generation worker', () => {
  it('runs every structured stage, persists full artifacts and attaches an independent revision without live events', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect(f.calls).toEqual(CAMPAIGN_GENERATION_STAGES);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect((await f.repository.steps(scope)).every((step) => step.status === 'SUCCEEDED')).toBe(
      true,
    );
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.content).toEqual(f.content);
    const before = f.calls.length;
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect(f.calls).toHaveLength(before);
  });
  it('resumes a prepared but undispatched durable input with its original trace and template', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    const claim = await f.repository.claim(scope, 'old-worker');
    if (claim.kind !== 'claimed') throw new Error('missing lease');
    const traceId = randomUUID();
    await f.repository.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.seed,
      prompt: JSON.stringify(campaignPreparationPrompt('concept', f.seed)),
      provider: PROVIDER,
      model: MODEL,
      traceId,
    });
    f.advance(120_001);
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect((await f.repository.steps(scope))[0]?.traceId).toBe(traceId);
    expect(f.calls).toEqual(CAMPAIGN_GENERATION_STAGES);
  });
  it('reuses a committed result after its storage acknowledgement is lost', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    const complete = f.repository.completeStep.bind(f.repository);
    let lost = false;
    f.repository.completeStep = async (...args) => {
      const result = await complete(...args);
      if (!lost) {
        lost = true;
        throw new Error('test lost commit acknowledgement');
      }
      return result;
    };
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    f.advance(120_001);
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('SUCCEEDED');
    expect(f.calls).toEqual(CAMPAIGN_GENERATION_STAGES);
  });
  it('marks lost dispatch uncertain and never invokes a second provider after lease takeover', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    const claim = await f.repository.claim(scope, 'lost-worker');
    if (claim.kind !== 'claimed') throw new Error('missing lease');
    await f.repository.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.seed,
      prompt: JSON.stringify(campaignPreparationPrompt('concept', f.seed)),
      provider: PROVIDER,
      model: MODEL,
      traceId: randomUUID(),
    });
    await f.repository.beginDispatch(claim.lease, 0);
    f.advance(120_001);
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect(f.calls).toEqual([]);
    expect((await f.repository.retry(scope, randomUUID(), f.sessionId)).kind).toBe('conflict');
  });
  it('cancels in flight and refuses the late result and attachment', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    f.beforeRun(async () => {
      await f.repository.cancel(scope);
    });
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect((await f.repository.get(scope))?.status).toBe('CANCELLED');
    expect(await f.revisions.latest(f.ownerId, f.draftId)).toBeNull();
    expect(f.calls).toEqual(['concept']);
  });
  it('keeps a late completed campaign as candidate when owner edits its selected base', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    f.beforeRun(async (input) => {
      if (input.stage !== 'outline') return;
      await f.revisions.append({
        ownerId: f.ownerId,
        draftId: f.draftId,
        requestId: randomUUID(),
        basedOnRevision: 0,
        content: f.seed,
        source: { kind: 'OWNER', actorId: f.ownerId },
        createdAt: new Date(T0).toISOString(),
      });
    });
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.content).toEqual(f.seed);
    expect((await f.repository.candidate(scope))?.content).toEqual(f.content);
    expect((await f.repository.get(scope))?.attachedRevision).toBeNull();
  });
  it('revocation stops the next dispatch and owner-private reads remain qualified', async () => {
    const f = await generationFixture(),
      scope = await queued(f);
    f.beforeRun(async () => {
      await f.workshop.revokeOwner(f.ownerId, new Date(T0).toISOString(), 'test:revoke');
    });
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run(scope);
    expect(f.calls).toEqual(['concept']);
    expect(await f.revisions.latest(f.ownerId, f.draftId)).toBeNull();
    expect(await f.repository.get({ ...scope, ownerId: randomUUID() })).toBeNull();
  });
});
