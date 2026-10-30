import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { memoryImageFixture, finishImage } from '../../testing/draft-image-fixture.ts';
import { MemoryCampaignRevisionControlRepository } from '../../testing/revision-controls.ts';
import { revisionReviewDigest } from './policy.ts';
import type { CampaignPackage } from '@ltw/contracts';

function entity(content: CampaignPackage) {
  const found = content.entities.find((e) => e.key === 'iva');
  if (!found) throw new Error('TEST_ENTITY');
  return found;
}

async function fixture() {
  const f = await memoryImageFixture();
  const controls = new MemoryCampaignRevisionControlRepository(
    f.workshop,
    f.revisions,
    f.images,
    [],
  );
  const locks = await controls.locks(f.scope),
    manifest = await f.images.manifest(f.scope, 1);
  if (!locks || !manifest) throw new Error('TEST_LOCKS');
  return {
    ...f,
    controls,
    locks,
    manifest,
    replace: () => ({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: manifest.version,
      manifestDigest: manifest.digest,
      targets: [],
    }),
    append: () => ({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: structuredClone(f.revision.content),
      source: { kind: 'OWNER' as const, actorId: f.scope.ownerId },
      createdAt: new Date().toISOString(),
    }),
  };
}
describe('memory revision control atomic semantics', () => {
  it('serializes installation against a manual append and rejects default stale locks', async () => {
    const f = await fixture();
    const target = {
      kind: 'content' as const,
      targetId: `entity:${f.revision.identities.entities['iva']}`,
    };
    const request = { ...f.replace(), targets: [target] };
    const locked = await f.controls.replaceLocks(request);
    expect(locked.kind).toBe('saved');
    const edit = { ...f.append(), expectedLockVersion: 1 };
    entity(edit.content).name += ' changed';
    expect(await f.revisions.append(edit)).toEqual({ kind: 'conflict', reason: 'LOCKED_CONTENT' });
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
    expect(await f.revisions.append(f.append())).toEqual({
      kind: 'conflict',
      reason: 'STALE_LOCKS',
    });
    const unlock = await f.controls.replaceLocks({ ...f.replace(), expectedLockVersion: 1 });
    expect(unlock.kind).toBe('saved');
    expect((await f.revisions.append({ ...edit, expectedLockVersion: 2 })).kind).toBe('saved');
    expect(await f.controls.replaceLocks(request)).toEqual(locked);
  });
  it('protects chosen art from removal and from source mutations, preserving unrelated choices', async () => {
    const f = await fixture(),
      made = await finishImage(f.images, f.request());
    const slot = {
      entityId: made.candidate.entityId,
      purpose: made.candidate.purpose,
      variant: made.candidate.variant,
      label: made.candidate.label,
    };
    const chosen = await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      ...slot,
      candidateId: made.candidate.candidateId,
    });
    if (chosen.kind !== 'saved') throw new Error('TEST_CHOICE');
    const lock = await f.controls.replaceLocks({
      ...f.replace(),
      manifestVersion: 1,
      manifestDigest: chosen.manifest.digest,
      targets: [{ kind: 'image', ...slot }],
    });
    expect(lock.kind).toBe('saved');
    expect(
      await f.images.select({
        ...f.scope,
        authSessionId: f.authSessionId,
        requestId: randomUUID(),
        revision: 1,
        packageDigest: f.revision.digest,
        expectedManifestVersion: 1,
        ...slot,
        candidateId: null,
      }),
    ).toEqual({ kind: 'conflict' });
    const edit = { ...f.append(), expectedLockVersion: 1 };
    entity(edit.content).description += ' changed';
    expect(await f.revisions.append(edit)).toEqual({ kind: 'conflict', reason: 'LOCKED_CONTENT' });
    expect((await f.images.manifest(f.scope, 1))?.version).toBe(1);
  });
  it('restores reviewed content as a new revision and exactly replays after concurrent head changes', async () => {
    const f = await fixture();
    const input = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      packageDigest: f.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      restoreRevision: 1,
      reviewDigest: revisionReviewDigest({
        kind: 'RESTORE',
        sourceId: '1',
        sourceDigest: f.revision.digest,
        headDigest: f.revision.digest,
        lockDigest: f.locks.digest,
        manifestDigest: f.manifest.digest,
      }),
    };
    const [a, b] = await Promise.all([
      f.controls.restore(input),
      f.controls.restore({ ...input, requestId: randomUUID() }),
    ]);
    expect(a.kind).toBe('saved');
    expect(b).toEqual({ kind: 'conflict', reason: 'STALE_REVISION' });
    expect(await f.controls.restore(input)).toEqual(a);
    expect(await f.controls.restore({ ...input, restoreRevision: 2 })).toEqual({
      kind: 'conflict',
      reason: 'REQUEST_REUSED',
    });
    expect((await f.revisions.get(f.scope.ownerId, f.scope.draftId, 1))?.digest).toBe(
      f.revision.digest,
    );
  });
});
