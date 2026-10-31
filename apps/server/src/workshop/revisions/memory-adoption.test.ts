import { randomUUID } from 'node:crypto';
import type { CampaignGenerationCandidate } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { memoryImageFixture } from '../../testing/draft-image-fixture.ts';
import { MemoryCampaignRevisionControlRepository } from '../../testing/revision-controls.ts';
import { imageDigest } from '../images/manifest.ts';
import type { StoredGenerationJob } from '../generation/store.ts';
import { revisionReviewDigest } from './policy.ts';

describe('memory reviewed candidate commit', () => {
  it('assesses the staged exact revision before committing identities, content, manifest or nonce', async () => {
    const f = await memoryImageFixture(),
      jobId = randomUUID(),
      traceId = randomUUID();
    const content = structuredClone(f.revision.content);
    content.world.startLocation = 'missing-place';
    content.entities.push({
      key: 'rejected-new-person',
      kind: 'npc',
      name: 'Rejected',
      description: '',
      status: 'active',
      existsSince: null,
    });
    const candidate: CampaignGenerationCandidate = {
      jobId,
      draftId: f.scope.draftId,
      baseRevision: 1,
      content,
      contentDigest: imageDigest(content),
      source: { kind: 'AI', jobId, traceId, provider: 'test', model: 'offline' },
      createdAt: new Date().toISOString(),
    };
    const job: StoredGenerationJob = {
      ...f.scope,
      jobId,
      baseRevision: 1,
      status: 'SUCCEEDED',
      nextStep: 7,
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
      attachedRevision: null,
      candidateAvailable: true,
      failureCode: null,
      mode: 'GENERATE',
      lockVersion: 0,
      editSpec: null,
      authSessionId: f.authSessionId,
      seed: f.revision.content,
      requestId: randomUUID(),
      fence: '1',
      workerId: randomUUID(),
      leaseUntil: null,
      retryOf: null,
    };
    const controls = new MemoryCampaignRevisionControlRepository(
      f.workshop,
      f.revisions,
      f.images,
      [
        {
          get: (scope) =>
            Promise.resolve(
              scope.ownerId === f.scope.ownerId &&
                scope.draftId === f.scope.draftId &&
                scope.jobId === jobId
                ? job
                : null,
            ),
          candidate: (scope) =>
            Promise.resolve(
              scope.ownerId === f.scope.ownerId &&
                scope.draftId === f.scope.draftId &&
                scope.jobId === jobId
                ? candidate
                : null,
            ),
        },
      ],
    );
    const locks = await controls.locks(f.scope),
      manifest = await f.images.manifest(f.scope, 1);
    if (!locks || !manifest) throw new Error('TEST_LOCKS');
    const input = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      packageDigest: f.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: manifest.digest,
      jobId,
      candidateDigest: candidate.contentDigest,
      reviewDigest: revisionReviewDigest({
        kind: 'ADOPTION',
        sourceId: jobId,
        sourceDigest: candidate.contentDigest,
        headDigest: f.revision.digest,
        lockDigest: locks.digest,
        manifestDigest: manifest.digest,
      }),
    };
    expect(await controls.adopt(input)).toEqual({ kind: 'conflict', reason: 'INVALID_CANDIDATE' });
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
    expect(await f.images.manifest(f.scope, 2)).toBeNull();
    const retry = structuredClone(f.revision.content);
    retry.entities.push({
      key: 'rejected-new-person',
      kind: 'item',
      name: 'Allowed',
      description: '',
      status: 'active',
      existsSince: null,
    });
    expect(
      (
        await f.revisions.append({
          ...f.scope,
          requestId: input.requestId,
          basedOnRevision: 1,
          content: retry,
          source: { kind: 'OWNER', actorId: f.scope.ownerId },
          createdAt: new Date().toISOString(),
        })
      ).kind,
    ).toBe('saved');
    expect(
      (await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.identities.entities[
        'rejected-new-person'
      ],
    ).toBeTruthy();
  });
});
