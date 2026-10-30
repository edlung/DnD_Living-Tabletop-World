import { randomUUID } from 'node:crypto';
import type {
  CampaignEditingContext,
  CampaignRevision,
  CampaignRevisionReview,
  DraftLockSnapshot,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { buildCampaignEditPlan } from '@ltw/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { finishImage, imageRequestFor } from '../../testing/draft-image-fixture.ts';
import { revisionHttpFixture, reviewedWrite } from '../../testing/revision-http.ts';
import { imageDigest } from '../images/manifest.ts';

const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
async function setup() {
  const f = await revisionHttpFixture();
  opened.push(f.app);
  return f;
}

describe('owner revision controls HTTP', () => {
  it('reviews a retired alias against the actual retained registry before offering adoption', async () => {
    const f = await setup(),
      content = structuredClone(f.content);
    content.entities.push({
      key: 'reserved-http-object',
      kind: 'item',
      name: 'Reserved object',
      description: '',
      status: 'active',
      existsSince: null,
    });
    const added = await f.revisions.append({
      ownerId: f.ownerId,
      draftId: f.draftId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date(f.now()).toISOString(),
    });
    if (added.kind !== 'saved') throw new Error('TEST_ADDED');
    const removed = await f.revisions.append({
      ownerId: f.ownerId,
      draftId: f.draftId,
      requestId: randomUUID(),
      basedOnRevision: 2,
      content: f.content,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date(f.now()).toISOString(),
    });
    if (removed.kind !== 'saved') throw new Error('TEST_REMOVED');
    const scope = { ownerId: f.ownerId, draftId: f.draftId },
      locks = await f.controls.locks(scope),
      manifest = await f.images.manifest(scope, 3);
    if (!locks || !manifest) throw new Error('TEST_CONTEXT');
    const spec = buildCampaignEditPlan(
      removed.revision,
      locks,
      manifest,
      'Reintroduce the selected object',
      ['section:entities'],
    ).spec;
    if (!spec) throw new Error('TEST_PLAN');
    const entity = content.entities.find((e) => e.key === 'reserved-http-object');
    if (!entity) throw new Error('TEST_ENTITY');
    entity.kind = 'feature';
    const queued = await f.edit.enqueueEdit({
      ...scope,
      authSessionId: f.sessionId,
      requestId: randomUUID(),
      basedOnRevision: 3,
      seed: removed.revision.content,
      lockVersion: locks.version,
      editSpec: spec,
    });
    if (queued.kind !== 'saved') throw new Error('TEST_JOB');
    const jobScope = { ...scope, jobId: queued.job.jobId },
      claim = await f.edit.claim(jobScope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('TEST_CLAIM');
    await f.edit.prepareStep(claim.lease, {
      ordinal: 0,
      input: removed.revision.content,
      prompt: 'test edit',
      provider: 'test',
      model: 'offline',
      traceId: randomUUID(),
    });
    await f.edit.beginDispatch(claim.lease, 0);
    await f.edit.completeStep(claim.lease, 0, { content, providerRequestId: null });
    await f.edit.finalize(claim.lease);
    const response = await f.send('GET', `${f.url}/edits/${jobScope.jobId}/review`);
    expect(response.statusCode).toBe(200);
    const review = response.json<CampaignRevisionReview>();
    expect(review.issues).toContain('IDENTITY_KIND_CHANGED');
    expect(review.adoptable).toBe(false);
    expect(response.body).not.toContain('retainedIdentities');
    expect(response.body).not.toContain('identityRecords');
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(3);
  });
  it('serves a complete private context, strict historical reads and fresh lock catalog', async () => {
    const f = await setup(),
      response = await f.send('GET', `${f.url}/editing`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const context = response.json<CampaignEditingContext>();
    expect(context.revision.digest).toBe(f.base.digest);
    expect(context.assessment.readiness).toBe('READY');
    expect(context.targets.some((target) => target.targetId === 'section:world')).toBe(true);
    expect(context.locks.version).toBe(0);
    expect(context.manifest.version).toBe(0);
    const body = {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: context.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: context.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    };
    const installed = await f.send('POST', `${f.url}/locks`, body);
    expect(installed.statusCode).toBe(200);
    expect(installed.json<{ locks: DraftLockSnapshot }>().locks.version).toBe(1);
    expect((await f.send('POST', `${f.url}/locks`, body)).json()).toEqual(installed.json());
    expect(
      (await f.send('POST', `${f.url}/locks`, { ...body, entries: [{ projection: 'forged' }] }))
        .statusCode,
    ).toBe(400);
    const refreshed = (
      await f.send('GET', `${f.url}/editing?revision=1`)
    ).json<CampaignEditingContext>();
    expect(refreshed.targets.find((target) => target.targetId === 'section:world')?.locked).toBe(
      true,
    );
    const stale = await f.send('POST', `${f.url}/locks`, {
      ...body,
      requestId: randomUUID(),
      targets: [],
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ conflict: { reason: 'STALE_LOCKS' } });
    for (const suffix of [
      '?revision=0',
      '?revision=01',
      '?revision=1&ownerId=forged',
      '?revision=1000001',
    ])
      expect((await f.send('GET', `${f.url}/editing${suffix}`)).statusCode).toBe(400);
    expect((await f.send('GET', `${f.url}/editing?revision=999`)).statusCode).toBe(404);
  });
  it('compares owned history and restores only the explicitly reviewed content as a new revision', async () => {
    const f = await setup(),
      content = structuredClone(f.content);
    content.world.opening += ' Owner revision.';
    const saved = await f.send('POST', `${f.url}/revisions`, {
      requestId: randomUUID(),
      basedOnRevision: 1,
      content,
    });
    expect(saved.statusCode).toBe(200);
    const compared = await f.send('GET', `${f.url}/compare?from=1&to=2`);
    expect(compared.statusCode).toBe(200);
    const comparison = compared.json<CampaignRevisionReview>();
    expect(comparison.kind).toBe('COMPARE');
    expect(comparison.adoptable).toBe(false);
    expect(comparison.before.revision).toBe(1);
    expect(comparison.after.world.opening).toBe(content.world.opening);
    expect(comparison.changes.some((change) => change.path.join('.') === 'world.opening')).toBe(
      true,
    );
    const reviewed = await f.send('GET', `${f.url}/revisions/1/restore-review`);
    expect(reviewed.statusCode).toBe(200);
    const review = reviewed.json<CampaignRevisionReview>();
    expect(review.kind).toBe('RESTORE');
    expect(review.before.revision).toBe(2);
    const body = reviewedWrite(review),
      restored = await f.send('POST', `${f.url}/revisions/1/restore`, body);
    expect(restored.statusCode).toBe(200);
    const result = restored.json<{ revision: CampaignRevision }>();
    expect(Object.keys(result).sort()).toEqual(['assessment', 'revision']);
    expect(result.revision.revision).toBe(3);
    expect(result.revision.content).toEqual(f.content);
    expect(result.revision.identities).toEqual(f.base.identities);
    expect(result.revision.source).toEqual({ kind: 'OWNER', actorId: f.ownerId });
    expect((await f.send('POST', `${f.url}/revisions/1/restore`, body)).json()).toEqual(result);
    const reused = await f.send('POST', `${f.url}/revisions/1/restore`, {
      ...body,
      reviewDigest: imageDigest({ different: true }),
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toEqual({ conflict: { reason: 'REQUEST_REUSED' } });
    expect((await f.send('GET', `${f.url}/compare?from=1&to=2&extra=1`)).statusCode).toBe(400);
    expect((await f.send('GET', `${f.url}/compare?from=1&to=999`)).statusCode).toBe(404);
    expect(await f.events.loadStream(f.draftId)).toBeNull();
    expect(await f.events.loadCommands(f.draftId)).toEqual([]);
  });
  it('reviews a durable EDIT and adopts trusted provenance only after explicit owner action', async () => {
    const f = await setup(),
      content = structuredClone(f.content);
    content.world.opening += ' Candidate opening.';
    const scope = await f.complete(content);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(1);
    const response = await f.send('GET', `${f.url}/edits/${scope.jobId}/review`);
    expect(response.statusCode).toBe(200);
    const review = response.json<CampaignRevisionReview>();
    expect(review.adoptable).toBe(true);
    expect(review.editSpec).toEqual(f.spec);
    expect(review.targets.some((target) => target.targetId === 'section:world')).toBe(true);
    for (const secret of [
      'authSessionId',
      'workerId',
      'leaseUntil',
      'tokenHash',
      'inputDigest',
      '"snapshot":',
    ])
      expect(response.body).not.toContain(secret);
    const body = { ...reviewedWrite(review), candidateDigest: review.candidateDigest };
    const forged = await f.send('POST', `${f.url}/edits/${scope.jobId}/adopt`, {
      ...body,
      source: { kind: 'OWNER', actorId: f.ownerId },
    });
    expect(forged.statusCode).toBe(400);
    const adopted = await f.send('POST', `${f.url}/edits/${scope.jobId}/adopt`, body);
    expect(adopted.statusCode).toBe(200);
    const result = adopted.json<{ revision: CampaignRevision }>();
    expect(Object.keys(result).sort()).toEqual(['assessment', 'revision']);
    expect(result.revision.revision).toBe(2);
    expect(result.revision.content).toEqual(content);
    expect(result.revision.source).toMatchObject({
      kind: 'AI',
      jobId: scope.jobId,
      provider: 'test',
      model: 'offline',
    });
    expect((await f.send('POST', `${f.url}/edits/${scope.jobId}/adopt`, body)).json()).toEqual(
      result,
    );
    expect((await f.edit.get(scope))?.attachedRevision).toBeNull();
    expect(f.calls).toEqual([]);
    expect(await f.events.loadStream(f.draftId)).toBeNull();
  });
  it('makes changed locks visible and refuses stale reviewed adoption without losing the candidate', async () => {
    const f = await setup(),
      content = structuredClone(f.content);
    content.world.opening += ' Candidate change.';
    const scope = await f.complete(content),
      path = `${f.url}/edits/${scope.jobId}`;
    const old = (await f.send('GET', `${path}/review`)).json<CampaignRevisionReview>();
    const installed = await f.send('POST', `${f.url}/locks`, {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    });
    expect(installed.statusCode).toBe(200);
    const stale = await f.send('POST', `${path}/adopt`, {
      ...reviewedWrite(old),
      candidateDigest: old.candidateDigest,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ conflict: { reason: 'STALE_LOCKS' } });
    const fresh = (await f.send('GET', `${path}/review`)).json<CampaignRevisionReview>();
    expect(fresh.adoptable).toBe(false);
    expect(fresh.conflicts).toMatchObject([
      { target: { kind: 'content', targetId: 'section:world' } },
    ]);
    const blocked = await f.send('POST', `${path}/adopt`, {
      ...reviewedWrite(fresh),
      candidateDigest: fresh.candidateDigest,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ conflict: { reason: 'LOCKED_CONTENT' } });
    expect((await f.edit.candidate(scope))?.content).toEqual(content);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(1);
  });
  it('requires a fresh review after chosen pictures change and preserves exact accepted retry', async () => {
    const f = await setup(),
      content = structuredClone(f.content);
    content.world.opening += ' Candidate change.';
    const scope = await f.complete(content),
      path = `${f.url}/edits/${scope.jobId}`;
    const prior = (await f.send('GET', `${path}/review`)).json<CampaignRevisionReview>();
    const made = await finishImage(
      f.images,
      imageRequestFor(f.base, { ownerId: f.ownerId, draftId: f.draftId }, f.sessionId),
    );
    await f.images.select({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedManifestVersion: 0,
      entityId: made.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: made.candidate.candidateId,
    });
    const stale = await f.send('POST', `${path}/adopt`, {
      ...reviewedWrite(prior),
      candidateDigest: prior.candidateDigest,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ conflict: { reason: 'STALE_MANIFEST' } });
    const fresh = (await f.send('GET', `${path}/review`)).json<CampaignRevisionReview>(),
      body = { ...reviewedWrite(fresh), candidateDigest: fresh.candidateDigest };
    const adopted = await f.send('POST', `${path}/adopt`, body);
    expect(adopted.statusCode).toBe(200);
    expect((await f.send('POST', `${path}/adopt`, body)).json()).toEqual(adopted.json());
    expect(
      (await f.images.manifest({ ownerId: f.ownerId, draftId: f.draftId }, 2))?.entries[0]
        ?.contentHash,
    ).toBe(made.candidate.contentHash);
  });
  it('authenticates before parsing and keeps foreign, campaign-cookie and revoked reads private', async () => {
    const f = await setup(),
      scope = await f.complete(),
      other = await f.loginOther();
    const paths = [
      `${f.url}/editing`,
      `${f.url}/compare?from=1&to=1`,
      `${f.url}/revisions/1/restore-review`,
      `${f.url}/edits/${scope.jobId}/review`,
    ];
    for (const path of paths) {
      expect(
        (
          await f.send('GET', path, undefined, {
            cookie: 'ltw_session=campaign-only',
            'x-workshop-owner': f.ownerId,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await f.send('GET', path, undefined, {
            cookie: other.cookie,
            'x-workshop-owner': other.ownerId,
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (
        await f.send('GET', '/workshop/drafts/not-a-uuid/editing?revision=bad', undefined, {
          cookie: '',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await f.send('GET', `${f.url}/editing`, undefined, { 'x-workshop-owner': other.ownerId }))
        .statusCode,
    ).toBe(409);
    expect((await f.send('POST', `${f.url}/locks`, { source: { kind: 'AI' } })).statusCode).toBe(
      400,
    );
    expect(
      (
        await f.send(
          'POST',
          `${f.url}/locks`,
          { source: { kind: 'AI' } },
          { cookie: other.cookie, 'x-workshop-owner': other.ownerId },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.send('POST', `${f.url}/locks`, {}, { origin: 'https://other.example' })).statusCode,
    ).toBe(403);
    await f.workshop.revokeOwner(f.ownerId, new Date(f.now()).toISOString(), 'test:430-revoked');
    const revoked = await f.send('GET', `${f.url}/editing`);
    expect(revoked.statusCode).toBe(401);
    expect(revoked.headers['set-cookie']).toBeUndefined();
  });
  it('keeps an owned GENERATE job outside the EDIT review and adoption namespace', async () => {
    const f = await setup();
    const queued = await f.repository.enqueue({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      seed: f.content,
    });
    if (queued.kind !== 'saved') throw new Error('TEST_GENERATE_JOB');
    expect(queued.job.mode).toBe('GENERATE');
    expect((await f.send('GET', `${f.url}/edits/${queued.job.jobId}/review`)).statusCode).toBe(404);
    const body = {
      requestId: randomUUID(),
      basedOnRevision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      candidateDigest: imageDigest(f.content),
      reviewDigest: imageDigest({ review: true }),
    };
    expect(
      (await f.send('POST', `${f.url}/edits/${queued.job.jobId}/adopt`, body)).statusCode,
    ).toBe(404);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(1);
  });
});
