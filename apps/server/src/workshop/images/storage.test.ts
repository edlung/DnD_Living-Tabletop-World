import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  finishImage,
  imageRequestFor,
  memoryImageFixture,
  TEST_DRAFT_PNG,
} from '../../testing/draft-image-fixture.ts';
import { draftImageSourceSignature } from './manifest.ts';

describe('draft image authoring storage', () => {
  it('stores exact bytes without choosing, replays completion, and fences cross-owner operations', async () => {
    const f = await memoryImageFixture();
    const request = f.request();
    const result = await finishImage(f.images, request);
    expect((await f.images.manifest(f.scope, 1))?.entries).toEqual([]);
    expect(await f.images.requestById(f.scope, request.requestId)).toMatchObject({
      jobId: result.scope.jobId,
      requestId: request.requestId,
      expectedManifestVersion: 0,
    });
    expect(
      await f.images.beginDispatch(result.lease, {
        chargeId: result.lease.chargeId,
        requestDigest: request.requestDigest,
      }),
    ).toBe('STORED');
    expect(
      await f.images.complete(result.lease, {
        bytes: result.bytes,
        mediaType: 'image/png',
        model: request.model,
      }),
    ).toEqual({ kind: 'stored', candidate: result.candidate });
    expect((await f.images.content(f.scope, result.candidate.contentHash))?.bytes).toEqual(
      TEST_DRAFT_PNG,
    );
    expect(await f.images.get({ ...result.scope, ownerId: randomUUID() })).toBeNull();
    expect(
      await f.images.candidate({ ...f.scope, ownerId: randomUUID() }, result.candidate.candidateId),
    ).toBeNull();
    expect(
      await f.images.content({ ...f.scope, ownerId: randomUUID() }, result.candidate.contentHash),
    ).toBeNull();
  });
  it('freezes inherited selection and marks conservative source edits stale', async () => {
    const f = await memoryImageFixture();
    const result = await finishImage(f.images, f.request());
    const selected = await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      entityId: result.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: result.candidate.candidateId,
    });
    expect(selected.kind).toBe('saved');
    const second = await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: { ...f.revision.content, firstSession: ['Unrelated owner change'] },
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: f.now(),
    });
    if (second.kind !== 'saved') throw new Error('TEST_REVISION');
    expect((await f.images.manifest(f.scope, 2))?.entries[0]?.state).toBe('CURRENT');
    const clear = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 1,
      entityId: result.candidate.entityId,
      purpose: 'image' as const,
      variant: 'reference' as const,
      label: null,
      candidateId: null,
    };
    await f.images.select(clear);
    expect((await f.images.manifest(f.scope, 2))?.entries).toHaveLength(1);
    const changed = structuredClone(second.revision.content);
    const iva = changed.entities.find((e) => e.key === 'iva');
    if (!iva) throw new Error('TEST_IVA');
    iva.description = 'Changed private motivation';
    await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 2,
      content: changed,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: f.now(),
    });
    expect((await f.images.manifest(f.scope, 3))?.entries[0]?.state).toBe('STALE');
  });
  it('allocates a new charge per safe takeover and pauses a possibly dispatched lost lease', async () => {
    const f = await memoryImageFixture();
    const created = await f.images.request(f.request());
    if (created.kind !== 'saved') throw new Error('TEST_REQUEST');
    const scope = { ...f.scope, jobId: created.job.jobId };
    const a = await f.images.claim(scope, randomUUID());
    if (a.kind !== 'claimed') throw new Error('TEST_CLAIM');
    f.advance(31000);
    const b = await f.images.claim(scope, randomUUID());
    if (b.kind !== 'claimed') throw new Error('TEST_TAKEOVER');
    expect(b.lease.chargeId).not.toBe(a.lease.chargeId);
    expect(
      await f.images.beginDispatch(a.lease, {
        chargeId: a.lease.chargeId,
        requestDigest: a.job.requestDigest,
      }),
    ).toBe('FENCED');
    expect(
      await f.images.beginDispatch(b.lease, {
        chargeId: b.lease.chargeId,
        requestDigest: b.job.requestDigest,
      }),
    ).toBe('DISPATCH');
    f.advance(31000);
    expect((await f.images.claim(scope, randomUUID())).kind).toBe('unavailable');
    expect((await f.images.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
  });
  it('uses exact purpose art fallback and invalidates map geometry without copying it into appearance', async () => {
    const f = await memoryImageFixture();
    const reference = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId, 0, 'sluice'),
    );
    await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      entityId: reference.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: reference.candidate.candidateId,
    });
    const map = imageRequestFor(f.revision, f.scope, f.authSessionId, 1, 'sluice', 'battle-map', {
      candidateId: reference.candidate.candidateId,
      contentHash: reference.candidate.contentHash,
      mediaType: 'image/png',
    });
    const revised = structuredClone(f.revision);
    const encounter = revised.content.encounters[0];
    if (!encounter) throw new Error('TEST_ENCOUNTER');
    encounter.battlefield.width += 1;
    expect(
      draftImageSourceSignature(
        revised,
        {
          entityId: map.input.subject.entityId,
          purpose: map.input.purpose,
          variant: map.input.variant,
          label: map.input.label,
        },
        map.input.reference?.contentHash ?? null,
      ),
    ).not.toBe(map.sourceSignature);
    expect(map.input.appearance).toBe('Wooden decking, machinery, an icy bank, and clear paths.');
  });
});
