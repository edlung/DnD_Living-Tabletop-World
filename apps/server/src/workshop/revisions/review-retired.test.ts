import { randomUUID } from 'node:crypto';
import type { CampaignRevision } from '@ltw/contracts';
import { buildCampaignEditPlan } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  finishImage,
  imageRequestFor,
  memoryImageFixture,
} from '../../testing/draft-image-fixture.ts';
import { imageDigest } from '../images/manifest.ts';
import { lockSnapshot } from './policy.ts';
import { buildCampaignRevisionReview } from './review.ts';

async function retiredFixture(chooseArt = false) {
  const f = await memoryImageFixture(),
    content = structuredClone(f.revision.content);
  content.entities.push(
    {
      key: 'retired-extra',
      kind: 'item',
      name: 'Reserved object',
      description: 'Original object',
      status: 'active',
      existsSince: null,
    },
    {
      key: 'retired-irrelevant',
      kind: 'feature',
      name: 'Unused old alias',
      description: '',
      status: 'active',
      existsSince: null,
    },
  );
  content.visuals.push({
    entity: 'retired-extra',
    purpose: 'image',
    description: 'A copper hand bell on a cloth',
    style: 'Ink drawing',
  });
  const append = (after: typeof content, base: number) =>
    f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: base,
      content: after,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: f.now(),
    });
  const added = await append(content, 1);
  if (added.kind !== 'saved') throw new Error('TEST_ADDED');
  let hash: string | null = null;
  if (chooseArt) {
    const made = await finishImage(
      f.images,
      imageRequestFor(added.revision, f.scope, f.authSessionId, 0, 'retired-extra'),
    );
    hash = made.candidate.contentHash;
    const chosen = await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 2,
      packageDigest: added.revision.digest,
      expectedManifestVersion: 0,
      entityId: made.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: made.candidate.candidateId,
    });
    if (chosen.kind !== 'saved') throw new Error('TEST_CHOSEN');
  }
  const removed = await append(f.revision.content, 2);
  if (removed.kind !== 'saved') throw new Error('TEST_REMOVED');
  const head: CampaignRevision = removed.revision,
    after = structuredClone(added.revision.content);
  after.entities = after.entities.filter((e) => e.key !== 'retired-irrelevant');
  const manifest = await f.images.manifest(f.scope, head.revision);
  if (!manifest) throw new Error('TEST_MANIFEST');
  const locks = lockSnapshot(head, manifest, 0, [], head.createdAt);
  const spec = buildCampaignEditPlan(head, locks, manifest, 'Restore the selected object', [
    'section:entities',
    'section:visuals',
  ]).spec;
  if (!spec) throw new Error('TEST_PLAN');
  return {
    ...f,
    head,
    after,
    manifest,
    locks,
    spec,
    append,
    hash,
    originalId: added.revision.identities.entities['retired-extra'],
  };
}

describe('retained registry review parity', () => {
  it('rejects changing a retired alias kind before adoption, and scopes the registry read to this proposal', async () => {
    const f = await retiredFixture(),
      changed = f.after.entities.find((e) => e.key === 'retired-extra');
    if (!changed) throw new Error('TEST_ENTITY');
    changed.kind = 'feature';
    const records = await f.revisions.identityRecords(f.scope.ownerId, f.scope.draftId, f.after);
    expect(records).toContainEqual({
      namespace: 'entities',
      key: 'retired-extra',
      id: f.originalId,
      entityKind: 'item',
    });
    expect(records.some((record) => record.key === 'retired-irrelevant')).toBe(false);
    expect(await f.revisions.identityRecords(randomUUID(), f.scope.draftId, f.after)).toEqual([]);
    const review = await buildCampaignRevisionReview({
      kind: 'EDIT',
      sourceId: randomUUID(),
      candidateDigest: imageDigest(f.after),
      head: f.head,
      after: f.after,
      locks: f.locks,
      manifest: f.manifest,
      ownerId: f.scope.ownerId,
      baseline: f.head,
      editSpec: f.spec,
      retainedIdentities: records,
    });
    expect(review.issues).toContain('IDENTITY_KIND_CHANGED');
    expect(review.adoptable).toBe(false);
    expect(review).not.toHaveProperty('retainedIdentities');
    expect(await f.append(f.after, 3)).toEqual({
      kind: 'conflict',
      reason: 'IDENTITY_KIND_CHANGED',
    });
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(3);
  });
  it('predicts the same restored canonical identity and art compatibility as the actual append', async () => {
    const f = await retiredFixture(true);
    expect(f.head.identities.entities['retired-extra']).toBeUndefined();
    expect(f.manifest.entries[0]?.state).toBe('STALE');
    const records = await f.revisions.identityRecords(f.scope.ownerId, f.scope.draftId, f.after);
    const review = await buildCampaignRevisionReview({
      kind: 'EDIT',
      sourceId: randomUUID(),
      candidateDigest: imageDigest(f.after),
      head: f.head,
      after: f.after,
      locks: f.locks,
      manifest: f.manifest,
      ownerId: f.scope.ownerId,
      baseline: f.head,
      editSpec: f.spec,
      retainedIdentities: records,
    });
    expect(review.adoptable).toBe(true);
    expect(review.assessment.readiness).toBe('READY');
    expect(review.visualChanges).toEqual([
      {
        entityId: f.originalId,
        purpose: 'image',
        label: null,
        beforeState: 'STALE',
        afterState: 'CURRENT',
        beforeHash: f.hash,
        afterHash: f.hash,
      },
    ]);
    const actual = await f.append(f.after, 3);
    if (actual.kind !== 'saved') throw new Error('TEST_APPEND');
    expect(actual.revision.identities.entities['retired-extra']).toBe(f.originalId);
    expect((await f.images.manifest(f.scope, 4))?.entries[0]).toMatchObject({
      entityId: f.originalId,
      state: 'CURRENT',
      contentHash: f.hash,
    });
  });
});
