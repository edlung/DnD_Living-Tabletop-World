import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accountingDb, type AccountingDb } from '../../testing/accounting.ts';
import { editPgFixture } from '../../testing/generation/edit-pg-fixture.ts';

let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});

describe('PostgreSQL selective edit durability', () => {
  it('qualifies every control/read/scheduler path by mode and shares nonce history', async () => {
    const f = await editPgFixture(db),
      scope = await f.enqueue();
    expect((await f.repository.get(scope))?.mode).toBe('EDIT');
    expect((await f.repository.list(scope, 20))[0]?.mode).toBe('EDIT');
    expect((await f.repository.progress(scope))?.job.mode).toBe('EDIT');
    expect((await f.repository.requestById(f, f.input.requestId))?.jobId).toBe(scope.jobId);
    expect(await f.generation.requestById(f, f.input.requestId)).toBeNull();
    expect(
      await f.repository.requestById({ ...f, ownerId: randomUUID() }, f.input.requestId),
    ).toBeNull();
    expect(await f.generation.get(scope)).toBeNull();
    expect(await f.generation.progress(scope)).toBeNull();
    expect(await f.generation.steps(scope)).toEqual([]);
    expect(await f.generation.candidate(scope)).toBeNull();
    expect(await f.generation.list(scope, 20)).toEqual([]);
    expect(await f.generation.pending(20)).toEqual([]);
    expect((await f.generation.cancel(scope)).kind).toBe('not-found');
    expect((await f.generation.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect((await f.generation.retry(scope, randomUUID(), f.authSessionId)).kind).toBe('not-found');
    expect(
      (
        await f.generation.enqueue({
          ownerId: f.ownerId,
          draftId: f.draftId,
          authSessionId: f.authSessionId,
          requestId: f.input.requestId,
          basedOnRevision: 1,
          seed: f.base.content,
        })
      ).kind,
    ).toBe('conflict');
  });
  it('stores one immutable edit artifact and candidate without creating a revision', async () => {
    const f = await editPgFixture(db),
      scope = await f.enqueue();
    const claim = await f.repository.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    const lease = claim.lease,
      traceId = randomUUID();
    const input = {
      ordinal: 0,
      input: f.base.content,
      prompt: 'EXACT_PRIVATE_REQUEST',
      provider: 'test',
      model: 'test',
      traceId,
    };
    expect((await f.repository.prepareStep(lease, { ...input, ordinal: 1 })).kind).toBe('conflict');
    expect((await f.repository.prepareStep(lease, input)).kind).toBe('prepared');
    expect((await f.repository.prepareStep(lease, { ...input, prompt: 'changed' })).kind).toBe(
      'conflict',
    );
    expect((await f.repository.beginDispatch(lease, 0)).kind).toBe('dispatch');
    const content = structuredClone(f.base.content);
    content.world.opening = 'The bell rings again.';
    expect(
      (await f.repository.completeStep(lease, 0, { content, providerRequestId: 'offline-result' }))
        .kind,
    ).toBe('stored');
    expect((await f.repository.finalize(lease)).kind).toBe('candidate');
    expect((await f.repository.finalize(lease)).kind).toBe('candidate');
    expect(await f.repository.get(scope)).toMatchObject({
      status: 'SUCCEEDED',
      nextStep: 1,
      attachedRevision: null,
      candidateAvailable: true,
    });
    const progress = await f.repository.progress(scope);
    expect(progress?.edit).toEqual({
      instruction: f.spec.instruction,
      requestedTargets: f.spec.requestedTargets,
    });
    expect(Object.keys(progress?.edit ?? {}).sort()).toEqual(['instruction', 'requestedTargets']);
    expect(progress?.steps[0]).toMatchObject({
      stage: 'edit',
      traceId,
      status: 'SUCCEEDED',
    });
    expect((await f.packages.latest(f.ownerId, f.draftId))?.revision).toBe(1);
    expect((await f.repository.candidate(scope))?.content).toEqual(content);
    expect((await db.pool.query('SELECT * FROM ltw_ai_preparation_sessions')).rows).toEqual([]);
  });
  it('replays original request before stale guards but rejects a new request and stale retry', async () => {
    const f = await editPgFixture(db),
      scope = await f.enqueue();
    const old = await f.repository.get(scope);
    const changed = await f.controls.replaceLocks({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:brief' }],
    });
    expect(changed.kind).toBe('saved');
    expect(await f.repository.enqueueEdit(f.input)).toEqual({ kind: 'saved', job: old });
    expect((await f.repository.enqueueEdit({ ...f.input, requestId: randomUUID() })).kind).toBe(
      'conflict',
    );
    const claim = await f.repository.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    await f.repository.fail(claim.lease, 'INVALID_OUTPUT');
    expect((await f.repository.retry(scope, randomUUID(), f.authSessionId)).kind).toBe('conflict');
  });
  it('never retries an expired dispatched edit and rejects late result storage', async () => {
    const f = await editPgFixture(db),
      scope = await f.enqueue();
    const claim = await f.repository.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    await f.repository.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.base.content,
      prompt: 'exact',
      provider: 'test',
      model: 'test',
      traceId: randomUUID(),
    });
    await f.repository.beginDispatch(claim.lease, 0);
    await db.pool.query(
      "UPDATE ltw_campaign_generation_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
      [scope.jobId],
    );
    expect((await f.repository.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect((await f.repository.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect((await f.repository.retry(scope, randomUUID(), f.authSessionId)).kind).toBe('conflict');
    expect(
      (
        await f.repository.completeStep(claim.lease, 0, {
          content: f.base.content,
          providerRequestId: null,
        })
      ).kind,
    ).toBe('fenced');
  });
  it('atomically captures current locks for legacy full generation after lock/unlock, while explicit stale CAS fails', async () => {
    const f = await editPgFixture(db);
    const lock = await f.controls.replaceLocks({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:brief' }],
    });
    expect(lock.kind).toBe('saved');
    const unlock = await f.controls.replaceLocks({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 1,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [],
    });
    expect(unlock.kind).toBe('saved');
    const input = {
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      seed: f.base.content,
    };
    const queued = await f.generation.enqueue(input);
    expect(queued.kind).toBe('saved');
    if (queued.kind !== 'saved') throw new Error('generation absent');
    expect(queued.job.lockVersion).toBe(2);
    expect(
      (await f.generation.enqueue({ ...input, requestId: randomUUID(), lockVersion: 0 })).kind,
    ).toBe('conflict');
    const currentLock = await f.controls.replaceLocks({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 2,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:brief' }],
    });
    expect(currentLock.kind).toBe('saved');
    expect(await f.generation.enqueue(input)).toEqual(queued);
    const scope = { ownerId: f.ownerId, draftId: f.draftId, jobId: queued.job.jobId };
    const claim = await f.generation.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('lease absent');
    for (let ordinal = 0; ordinal < 7; ordinal++) {
      await f.generation.prepareStep(claim.lease, {
        ordinal,
        input: f.base.content,
        prompt: 'exact',
        provider: 'test',
        model: 'test',
        traceId: randomUUID(),
      });
      await f.generation.beginDispatch(claim.lease, ordinal);
      await f.generation.completeStep(claim.lease, ordinal, {
        content: f.base.content,
        providerRequestId: null,
      });
    }
    expect((await f.generation.finalize(claim.lease)).kind).toBe('candidate');
    expect((await f.packages.latest(f.ownerId, f.draftId))?.revision).toBe(1);
  });
});
