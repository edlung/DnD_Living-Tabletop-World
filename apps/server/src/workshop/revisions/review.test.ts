import { randomUUID } from 'node:crypto';
import type { CampaignRevision } from '@ltw/contracts';
import { buildCampaignEditPlan } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { memoryImageFixture } from '../../testing/draft-image-fixture.ts';
import { draftImageSourceSignature, imageDigest, newVisualManifest } from '../images/manifest.ts';
import { campaignContentDigest } from '../packages/content.ts';
import { captureDraftLocks, lockSnapshot, revisionReviewDigest } from './policy.ts';
import { buildCampaignRevisionReview, type BuildCampaignRevisionReview } from './review.ts';

async function fixture() {
  const f = await memoryImageFixture();
  const manifest = await f.images.manifest(f.scope, 1);
  if (!manifest) throw new Error('TEST_MANIFEST');
  const locks = lockSnapshot(f.revision, manifest, 0, [], f.revision.createdAt);
  const input = (after = structuredClone(f.revision.content)): BuildCampaignRevisionReview => ({
    kind: 'EDIT',
    sourceId: randomUUID(),
    candidateDigest: imageDigest(after),
    head: f.revision,
    after,
    locks,
    manifest,
    ownerId: f.scope.ownerId,
    baseline: f.revision,
  });
  return { ...f, manifest, locks, input };
}

describe('owner revision review composition', () => {
  it('shows the full diff and exact actionable digest without changing stored revisions', async () => {
    const f = await fixture(),
      after = structuredClone(f.revision.content);
    after.world.opening += ' A revised opening.';
    const plan = buildCampaignEditPlan(
      f.revision,
      f.locks,
      { version: 0, digest: f.manifest.digest },
      'Revise the opening',
      ['section:world'],
    );
    if (!plan.spec) throw new Error('TEST_PLAN');
    const input = { ...f.input(after), editSpec: plan.spec },
      prior = structuredClone(input);
    const review = await buildCampaignRevisionReview(input);
    expect(review.adoptable).toBe(true);
    expect(review.editSpec).toEqual(plan.spec);
    expect(review.assessment.readiness).toBe('READY');
    expect(review.changes).toContainEqual({
      targetId: 'section:world',
      path: ['world', 'opening'],
      kind: 'CHANGED',
      before: f.revision.content.world.opening,
      after: after.world.opening,
    });
    expect(review.reviewDigest).toBe(
      revisionReviewDigest({
        kind: 'ADOPTION',
        sourceId: input.sourceId,
        sourceDigest: input.candidateDigest,
        headDigest: f.revision.digest,
        lockDigest: f.locks.digest,
        manifestDigest: f.manifest.digest,
      }),
    );
    expect(input).toEqual(prior);
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
    expect(await f.images.manifest(f.scope, 2)).toBeNull();
  });

  it('assesses new package keys with private prospective IDs and never exposes a new world', async () => {
    const f = await fixture(),
      after = structuredClone(f.revision.content);
    after.entities.push({
      key: 'review-only-item',
      kind: 'item',
      name: 'New object',
      description: '',
      status: 'active',
      existsSince: null,
    });
    const review = await buildCampaignRevisionReview(f.input(after));
    expect(review.assessment.readiness).not.toBe('INVALID');
    expect(review.adoptable).toBe(true);
    expect(review.before.identities.entities['review-only-item']).toBeUndefined();
    expect(review).not.toHaveProperty('identities');
    expect(review).not.toHaveProperty('snapshot');
    expect(
      (await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.identities.entities[
        'review-only-item'
      ],
    ).toBeUndefined();
  });

  it('flags an old candidate baseline even when a fresh review can still describe its changes', async () => {
    const f = await fixture(),
      content = structuredClone(f.revision.content);
    content.world.opening += ' Current owner edit.';
    const head: CampaignRevision = {
      ...f.revision,
      revision: 2,
      basedOnRevision: 1,
      content,
      digest: campaignContentDigest(content, f.revision.identities),
    };
    const manifest = newVisualManifest(head, 0, [], head.createdAt);
    const review = await buildCampaignRevisionReview({ ...f.input(), head, manifest });
    expect(review.issues).toContain('STALE_REVISION');
    expect(review.changes.length).toBeGreaterThan(0);
    expect(review.adoptable).toBe(false);
  });

  it('shows locked content and selected-image source conflicts with truthful stale art consequences', async () => {
    const f = await fixture(),
      entityId = f.revision.identities.entities['iva'];
    if (!entityId) throw new Error('TEST_ENTITY');
    const slot = {
      entityId,
      purpose: 'image' as const,
      variant: 'reference' as const,
      label: null,
    };
    const sourceSignature = draftImageSourceSignature(f.revision, slot, null);
    if (!sourceSignature) throw new Error('TEST_SOURCE');
    const hash = imageDigest({ bytes: 'chosen' });
    const manifest = newVisualManifest(
      f.revision,
      1,
      [
        {
          ...slot,
          candidateId: randomUUID(),
          contentHash: hash,
          mediaType: 'image/png',
          sourceRevision: 1,
          sourceSignature,
          referenceHash: null,
          state: 'CURRENT',
          staleReason: null,
        },
      ],
      f.revision.createdAt,
    );
    const entries = captureDraftLocks(f.revision, manifest, [
      { kind: 'content', targetId: `entity:${entityId}` },
      { kind: 'image', ...slot },
    ]);
    if (!entries) throw new Error('TEST_LOCKS');
    const locks = lockSnapshot(f.revision, manifest, 1, entries, f.revision.createdAt),
      after = structuredClone(f.revision.content);
    const actor = after.entities.find((item) => item.key === 'iva');
    if (!actor) throw new Error('TEST_ACTOR');
    actor.description += ' Changed appearance source.';
    const review = await buildCampaignRevisionReview({ ...f.input(after), locks, manifest });
    expect(review.conflicts.map((conflict) => conflict.target.kind).sort()).toEqual([
      'content',
      'image',
    ]);
    expect(review.visualChanges).toEqual([
      {
        entityId,
        purpose: 'image',
        label: null,
        beforeState: 'CURRENT',
        afterState: 'STALE',
        beforeHash: hash,
        afterHash: hash,
      },
    ]);
    expect(review.adoptable).toBe(false);
  });

  it('rejects output outside the frozen edit scope and a mismatched candidate digest', async () => {
    const f = await fixture(),
      after = structuredClone(f.revision.content);
    const actor = after.entities.find((item) => item.key === 'iva');
    if (!actor) throw new Error('TEST_ENTITY');
    actor.description += ' Unauthorized actor change.';
    const plan = buildCampaignEditPlan(
      f.revision,
      f.locks,
      { version: 0, digest: f.manifest.digest },
      'Change only world prose',
      ['section:world'],
    );
    if (!plan.spec) throw new Error('TEST_PLAN');
    const review = await buildCampaignRevisionReview({
      ...f.input(after),
      editSpec: plan.spec,
      candidateDigest: imageDigest({ wrong: true }),
    });
    expect(review.issues).toContain('CANDIDATE_DIGEST');
    expect(review.issues.some((issue) => issue.startsWith('EDIT_OUTSIDE_SCOPE:entities'))).toBe(
      true,
    );
    expect(review.adoptable).toBe(false);
  });

  it('allows explicit restore of invalid content for correction and keeps comparison read-only', async () => {
    const f = await fixture(),
      after = structuredClone(f.revision.content);
    after.world.startLocation = 'missing-place';
    const candidateDigest = campaignContentDigest(after, f.revision.identities);
    const restore = await buildCampaignRevisionReview({
      ...f.input(after),
      kind: 'RESTORE',
      sourceId: '4',
      candidateDigest,
    });
    expect(restore.assessment.readiness).toBe('INVALID');
    expect(restore.adoptable).toBe(true);
    expect(restore.reviewDigest).toBe(
      revisionReviewDigest({
        kind: 'RESTORE',
        sourceId: '4',
        sourceDigest: candidateDigest,
        headDigest: f.revision.digest,
        lockDigest: f.locks.digest,
        manifestDigest: f.manifest.digest,
      }),
    );
    const comparison = await buildCampaignRevisionReview({
      ...f.input(after),
      kind: 'COMPARE',
      sourceId: '4',
      candidateDigest,
    });
    expect(comparison.adoptable).toBe(false);
    expect(comparison.reviewDigest).not.toBe(restore.reviewDigest);
  });

  it('reports identity-kind conflicts without mutating canonical mappings', async () => {
    const f = await fixture(),
      after = structuredClone(f.revision.content);
    const entity = after.entities.find((item) => item.key === 'iva');
    if (!entity) throw new Error('TEST_ENTITY');
    entity.kind = 'faction';
    const review = await buildCampaignRevisionReview(f.input(after));
    expect(review.issues).toContain('IDENTITY_KIND_CHANGED');
    expect(review.adoptable).toBe(false);
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.identities).toEqual(
      f.revision.identities,
    );
  });
  it('does not offer adoption after the last appendable revision', async () => {
    const f = await fixture();
    const head = { ...f.revision, revision: 1_000_000, basedOnRevision: 999_999 };
    const manifest = newVisualManifest(head, 0, [], head.createdAt);
    const review = await buildCampaignRevisionReview({
      ...f.input(),
      head,
      manifest,
      baseline: head,
    });
    expect(review.issues).toContain('REVISION_LIMIT');
    expect(review.adoptable).toBe(false);
  });
  it('uses historical IDs for a restored deleted key while inheriting only current selected art', async () => {
    const f = await fixture(),
      entityId = f.revision.identities.entities['iva'];
    if (!entityId) throw new Error('TEST_ENTITY');
    const slot = {
      entityId,
      purpose: 'image' as const,
      variant: 'reference' as const,
      label: null,
    };
    const signature = draftImageSourceSignature(f.revision, slot, null);
    if (!signature) throw new Error('TEST_SOURCE');
    const content = structuredClone(f.revision.content);
    content.entities = content.entities.filter((e) => e.key !== 'iva');
    const identities = {
      ...f.revision.identities,
      entities: Object.fromEntries(
        Object.entries(f.revision.identities.entities).filter(([key]) => key !== 'iva'),
      ),
    };
    const head: CampaignRevision = {
      ...f.revision,
      revision: 2,
      basedOnRevision: 1,
      content,
      identities,
      digest: campaignContentDigest(content, identities),
    };
    const hash = imageDigest({ chosen: 'current-head' });
    const manifest = newVisualManifest(
      head,
      0,
      [
        {
          ...slot,
          candidateId: randomUUID(),
          contentHash: hash,
          mediaType: 'image/png',
          sourceRevision: 1,
          sourceSignature: signature,
          referenceHash: null,
          state: 'CURRENT',
          staleReason: null,
        },
      ],
      head.createdAt,
    );
    expect(manifest.entries[0]?.state).toBe('STALE');
    const review = await buildCampaignRevisionReview({
      ...f.input(),
      kind: 'RESTORE',
      sourceId: '1',
      candidateDigest: f.revision.digest,
      head,
      manifest,
      baseline: f.revision,
    });
    expect(review.assessment.readiness).toBe('READY');
    expect(review.adoptable).toBe(true);
    expect(review.visualChanges).toEqual([
      {
        entityId,
        purpose: 'image',
        label: null,
        beforeState: 'STALE',
        afterState: 'CURRENT',
        beforeHash: hash,
        afterHash: hash,
      },
    ]);
    const empty = newVisualManifest(head, 0, [], head.createdAt);
    const noChoice = await buildCampaignRevisionReview({
      ...f.input(),
      kind: 'RESTORE',
      sourceId: '1',
      candidateDigest: f.revision.digest,
      head,
      manifest: empty,
      baseline: f.revision,
    });
    expect(noChoice.visualChanges).toEqual([]);
    expect(noChoice.manifest.entries).toEqual([]);
  });
});
