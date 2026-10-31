import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { editFixture } from '../../testing/generation/edit-fixture.ts';
import { generationFixture } from '../../testing/generation/fixture.ts';
import { MemoryCampaignRevisionControlRepository } from '../../testing/revision-controls.ts';
import { MemoryCampaignGenerationRepository } from '../../testing/generation-store.ts';
import { CampaignGenerationWorker } from './worker.ts';

describe('generation mode boundary', () => {
  it('does not expose or schedule full generation through an edit repository', async () => {
    const f = await generationFixture();
    const queued = await f.enqueue();
    if (queued.kind !== 'saved') throw new Error('job missing');
    const edit = new MemoryCampaignGenerationRepository(f.workshop, f.revisions, f.now, 'EDIT');
    const scope = { ownerId: f.ownerId, draftId: f.draftId, jobId: queued.job.jobId };
    expect((await f.repository.list(scope, 20))[0]).not.toHaveProperty('mode');
    expect((await f.repository.progress(scope))?.job).not.toHaveProperty('mode');
    expect(await edit.get(scope)).toBeNull();
    expect(await edit.progress(scope)).toBeNull();
    expect(await edit.steps(scope)).toEqual([]);
    expect(await edit.candidate(scope)).toBeNull();
    expect(await edit.pending(20)).toEqual([]);
    expect(await edit.list(scope, 20)).toEqual([]);
    expect((await edit.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect((await edit.cancel(scope)).kind).toBe('not-found');
    expect((await edit.retry(scope, randomUUID(), f.sessionId)).kind).toBe('not-found');
    await new CampaignGenerationWorker({ repository: edit, preparation: f.preparation }).run(scope);
    expect(f.calls).toEqual([]);
    expect((await f.repository.get(scope))?.status).toBe('QUEUED');
  });
});

describe('shared mode-qualified edit storage', () => {
  it('keeps edit rows invisible to every generation path and rejects cross-mode nonce reuse', async () => {
    const f = await editFixture(),
      scope = await f.enqueue();
    expect((await f.edit.get(scope))?.mode).toBe('EDIT');
    expect((await f.edit.list(scope, 20))[0]?.mode).toBe('EDIT');
    expect((await f.edit.progress(scope))?.job.mode).toBe('EDIT');
    expect((await f.edit.requestById(f, f.input.requestId))?.jobId).toBe(scope.jobId);
    expect(await f.repository.requestById(f, f.input.requestId)).toBeNull();
    expect(await f.edit.requestById({ ...f, ownerId: randomUUID() }, f.input.requestId)).toBeNull();
    expect(await f.repository.get(scope)).toBeNull();
    expect(await f.repository.progress(scope)).toBeNull();
    expect(await f.repository.steps(scope)).toEqual([]);
    expect(await f.repository.candidate(scope)).toBeNull();
    expect(await f.repository.pending(20)).toEqual([]);
    expect(await f.repository.list(scope, 20)).toEqual([]);
    expect((await f.repository.cancel(scope)).kind).toBe('not-found');
    expect((await f.repository.claim(scope, randomUUID())).kind).toBe('unavailable');
    const generation = {
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      requestId: f.input.requestId,
      basedOnRevision: f.base.revision,
      seed: f.content,
    };
    expect((await f.repository.enqueue(generation)).kind).toBe('conflict');
    expect((await f.edit.enqueueEdit(f.input)).kind).toBe('saved');
    await new CampaignGenerationWorker({ repository: f.edit, preparation: f.preparation }).run(
      scope,
    );
    expect(f.calls).toEqual([]);
    expect((await f.edit.get(scope))?.status).toBe('QUEUED');
  });
  it('permits only edit ordinal zero and finalizes an immutable candidate without appending', async () => {
    const f = await editFixture(),
      scope = await f.enqueue();
    const claim = await f.edit.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    const step = {
      ordinal: 0,
      input: f.content,
      prompt: 'exact private edit',
      provider: 'test',
      model: 'test',
      traceId: randomUUID(),
    };
    expect((await f.edit.prepareStep(claim.lease, { ...step, ordinal: 1 })).kind).toBe('conflict');
    expect((await f.edit.prepareStep(claim.lease, step)).kind).toBe('prepared');
    expect((await f.edit.steps(scope))[0]?.stage).toBe('edit');
    expect((await f.edit.beginDispatch(claim.lease, 0)).kind).toBe('dispatch');
    const content = structuredClone(f.content);
    content.world.opening = 'A bell sounds again.';
    expect(
      (await f.edit.completeStep(claim.lease, 0, { content, providerRequestId: 'offline' })).kind,
    ).toBe('stored');
    expect((await f.edit.finalize(claim.lease)).kind).toBe('candidate');
    expect((await f.edit.get(scope))?.attachedRevision).toBeNull();
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(1);
    expect((await f.edit.candidate(scope))?.content).toEqual(content);
    expect((await f.edit.progress(scope))?.steps[0]?.stage).toBe('edit');
  });
  it('checks frozen context for new requests, but immutable nonce replay precedes changed guards', async () => {
    const f = await editFixture();
    const original = await f.edit.enqueueEdit(f.input);
    f.edit.configureControls({
      locksWithinDraftLock: () => ({ ...f.locks, version: 1 }),
      manifest: () => f.manifest,
    });
    expect(await f.edit.enqueueEdit(f.input)).toEqual(original);
    expect((await f.edit.enqueueEdit({ ...f.input, requestId: randomUUID() })).kind).toBe(
      'conflict',
    );
  });
  it('fences uncertain edit dispatches and forbids retry and redispatch', async () => {
    const f = await editFixture(),
      scope = await f.enqueue();
    const claim = await f.edit.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    await f.edit.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.content,
      prompt: 'exact',
      provider: 'test',
      model: 'test',
      traceId: randomUUID(),
    });
    await f.edit.beginDispatch(claim.lease, 0);
    f.advance(30001);
    expect((await f.edit.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect((await f.edit.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect((await f.edit.cancel(scope)).kind).toBe('conflict');
    expect((await f.edit.retry(scope, randomUUID(), f.sessionId)).kind).toBe('conflict');
    expect(
      (await f.edit.completeStep(claim.lease, 0, { content: f.content, providerRequestId: null }))
        .kind,
    ).toBe('fenced');
  });
  it('keeps legacy full generation usable after lock/unlock by capturing the current version', async () => {
    const f = await editFixture();
    const controls = new MemoryCampaignRevisionControlRepository(
      f.workshop,
      f.revisions,
      f.images,
      [f.repository, f.edit],
      f.now,
    );
    f.repository.configureControls({
      locksWithinDraftLock: (scope, head) => controls.locksWithinDraftLock(scope, head),
      manifest: (scope, revision) => f.images.snapshotManifest(scope, revision),
    });
    const context = {
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      revision: 1,
      packageDigest: f.base.digest,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
    };
    expect(
      (
        await controls.replaceLocks({
          ...context,
          requestId: randomUUID(),
          expectedLockVersion: 0,
          targets: [{ kind: 'content', targetId: 'section:brief' }],
        })
      ).kind,
    ).toBe('saved');
    expect(
      (
        await controls.replaceLocks({
          ...context,
          requestId: randomUUID(),
          expectedLockVersion: 1,
          targets: [],
        })
      ).kind,
    ).toBe('saved');
    const input = {
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      seed: f.base.content,
    };
    expect(
      (await f.repository.enqueue({ ...input, requestId: randomUUID(), lockVersion: 0 })).kind,
    ).toBe('conflict');
    const queued = await f.repository.enqueue(input);
    if (queued.kind !== 'saved') throw new Error('generation absent');
    expect(queued.job.lockVersion).toBe(2);
    await new CampaignGenerationWorker({
      repository: f.repository,
      preparation: f.preparation,
    }).run({ ...f, jobId: queued.job.jobId });
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(2);
    expect((await f.repository.get({ ...f, jobId: queued.job.jobId }))?.attachedRevision).toBe(2);
  });
  it('terminally cancels queued edit work when its actual author session ends', async () => {
    const f = await editFixture(),
      scope = await f.enqueue();
    for (const session of f.workshop.sessions.values())
      if (session.sessionId === f.sessionId) session.revokedAt = new Date(f.now()).toISOString();
    expect((await f.edit.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect(await f.edit.get(scope)).toMatchObject({
      status: 'CANCELLED',
      failureCode: 'AUTH_SESSION_ENDED',
    });
    expect(await f.edit.pending(10)).toEqual([]);
  });
});
