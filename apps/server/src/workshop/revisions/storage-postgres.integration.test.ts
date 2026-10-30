import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { revisionControlFixture } from '../../testing/revision-controls-postgres.ts';
import { finishImage, imageRequestFor } from '../../testing/draft-image-fixture.ts';
import { campaignContentDigest, campaignRequestFingerprint } from '../packages/content.ts';
import { imageDigest } from '../images/manifest.ts';
import { revisionReviewDigest } from './policy.ts';
import type { DraftLockTarget, CampaignPackage } from '@ltw/contracts';

let pool: pg.Pool;
const cleanup: (() => Promise<unknown>)[] = [];
beforeEach(async () => {
  const db = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => db.drop());
  pool = new pg.Pool({ connectionString: db.url, max: 5 });
  const p = pool;
  cleanup.push(() => p.end());
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
type Fixture = Awaited<ReturnType<typeof revisionControlFixture>>;
function entity(content: CampaignPackage, key = 'iva') {
  const found = content.entities.find((e) => e.key === key);
  if (!found) throw new Error('TEST_ENTITY');
  return found;
}
async function counts(f: Fixture) {
  return (
    await pool.query<{
      revisions: string;
      identities: string;
      manifests: string;
      receipts: string;
    }>(
      `SELECT
    (SELECT count(*) FROM ltw_campaign_package_revisions WHERE owner_id=$1 AND draft_id=$2) revisions,
    (SELECT count(*) FROM ltw_campaign_package_identities WHERE owner_id=$1 AND draft_id=$2) identities,
    (SELECT count(*) FROM ltw_workshop_visual_manifests WHERE owner_id=$1 AND draft_id=$2) manifests,
    (SELECT count(*) FROM ltw_campaign_revision_write_receipts WHERE owner_id=$1 AND draft_id=$2) receipts`,
      [f.scope.ownerId, f.scope.draftId],
    )
  ).rows[0];
}
function restoreIntent(f: Fixture) {
  return {
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
}
async function candidate(f: Fixture, content = structuredClone(f.revision.content)) {
  const jobId = randomUUID(),
    source = { kind: 'AI', jobId, traceId: randomUUID(), provider: 'test', model: 'offline' };
  await pool.query(
    `INSERT INTO ltw_campaign_generation_jobs(job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,
    base_revision,seed,status,next_step,created_at,updated_at,candidate_available)
    VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,'SUCCEEDED',7,clock_timestamp(),clock_timestamp(),true)`,
    [
      jobId,
      f.scope.ownerId,
      f.scope.draftId,
      f.authSessionId,
      randomUUID(),
      imageDigest({ jobId }),
      JSON.stringify(f.revision.content),
    ],
  );
  const digest = imageDigest(content);
  await pool.query(
    `INSERT INTO ltw_campaign_generation_candidates(owner_id,draft_id,job_id,content,content_digest,source,created_at)
    VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,clock_timestamp())`,
    [
      f.scope.ownerId,
      f.scope.draftId,
      jobId,
      JSON.stringify(content),
      digest,
      JSON.stringify(source),
    ],
  );
  return {
    ...restoreIntent(f),
    jobId,
    candidateDigest: digest,
    reviewDigest: revisionReviewDigest({
      kind: 'ADOPTION',
      sourceId: jobId,
      sourceDigest: digest,
      headDigest: f.revision.digest,
      lockDigest: f.locks.digest,
      manifestDigest: f.manifest.digest,
    }),
  };
}

describe('protected immutable revision storage', () => {
  it('serializes lock CAS and replays the original snapshot before current guards', async () => {
    const f = await revisionControlFixture(pool);
    const request = {
      ...f.replace(),
      targets: [
        {
          kind: 'content',
          targetId: `entity:${f.revision.identities.entities['iva']}`,
        } as DraftLockTarget,
      ],
    };
    const otherRequest = { ...f.replace(), targets: [] };
    const [a, b] = await Promise.all([
      f.controls.replaceLocks(request),
      f.controls.replaceLocks(otherRequest),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(['conflict', 'saved']);
    const winner = a.kind === 'saved' ? a : b;
    if (winner.kind !== 'saved') throw new Error('TEST_LOCK_WINNER');
    const next = await f.controls.replaceLocks({ ...f.replace(), expectedLockVersion: 1 });
    expect(next.kind).toBe('saved');
    const original = a.kind === 'saved' ? request : otherRequest;
    expect(await f.controls.replaceLocks(original)).toEqual(winner);
    expect(await f.controls.replaceLocks({ ...original, manifestVersion: 2 })).toEqual({
      kind: 'conflict',
      reason: 'REQUEST_REUSED',
    });
    expect((await f.controls.locks(f.scope))?.version).toBe(2);
    expect(await f.controls.locks({ ...f.scope, ownerId: randomUUID() })).toBeNull();
  });
  it('guards every append before allocating identities and keeps nonce policy distinct', async () => {
    const f = await revisionControlFixture(pool);
    const installed = await f.controls.replaceLocks({
      ...f.replace(),
      targets: [{ kind: 'content', targetId: `entity:${f.revision.identities.entities['iva']}` }],
    });
    expect(installed.kind).toBe('saved');
    const rejected = f.append();
    entity(rejected.content).description += ' changed';
    rejected.content.entities.push({ ...entity(rejected.content), key: 'new-locked-reject' });
    const before = await counts(f);
    expect(await f.revisions.append({ ...rejected, expectedLockVersion: 1 })).toEqual({
      kind: 'conflict',
      reason: 'LOCKED_CONTENT',
    });
    expect(await counts(f)).toEqual(before);
    expect(await f.revisions.append(f.append())).toEqual({
      kind: 'conflict',
      reason: 'STALE_LOCKS',
    });
    const allowed = { ...f.append(), expectedLockVersion: 1 };
    allowed.content.world.opening += ' revised';
    const saved = await f.revisions.append(allowed);
    expect(saved.kind).toBe('saved');
    expect(await f.revisions.append(allowed)).toEqual(saved);
    expect(await f.revisions.append({ ...allowed, expectedLockVersion: 2 })).toEqual({
      kind: 'conflict',
      reason: 'REQUEST_REUSED',
    });
  });
  it('rejects source edits and removing a locked chosen picture without partial manifests', async () => {
    const f = await revisionControlFixture(pool),
      made = await finishImage(f.images, imageRequestFor(f.revision, f.scope, f.authSessionId));
    const slot = {
      entityId: made.candidate.entityId,
      purpose: made.candidate.purpose,
      variant: made.candidate.variant,
      label: made.candidate.label,
    };
    const selection = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      ...slot,
      candidateId: made.candidate.candidateId,
    };
    const chosen = await f.images.select(selection);
    if (chosen.kind !== 'saved') throw new Error('TEST_CHOICE');
    expect(
      (
        await f.controls.replaceLocks({
          ...f.replace(),
          manifestVersion: 1,
          manifestDigest: chosen.manifest.digest,
          targets: [{ kind: 'image', ...slot }],
        })
      ).kind,
    ).toBe('saved');
    expect(
      await f.images.select({
        ...selection,
        requestId: randomUUID(),
        expectedManifestVersion: 1,
        candidateId: null,
      }),
    ).toEqual({ kind: 'conflict' });
    const edit = { ...f.append(), expectedLockVersion: 1 };
    entity(edit.content).description += ' revised';
    const before = await counts(f);
    expect(await f.revisions.append(edit)).toEqual({ kind: 'conflict', reason: 'LOCKED_CONTENT' });
    expect(await counts(f)).toEqual(before);
    const harmless = { ...f.append(), expectedLockVersion: 1 };
    harmless.content.world.opening += ' revised';
    const saved = await f.revisions.append(harmless);
    expect(saved.kind).toBe('saved');
    expect((await f.images.manifest(f.scope, 2))?.entries[0]?.state).toBe('CURRENT');
  });
  it('checks manual manifest CAS and keeps exact accepted retry after later selection', async () => {
    const f = await revisionControlFixture(pool),
      input = {
        ...f.append(),
        expectedManifestVersion: 0,
        expectedManifestDigest: f.manifest.digest,
      };
    const made = await finishImage(f.images, imageRequestFor(f.revision, f.scope, f.authSessionId));
    await f.images.select({
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      entityId: made.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: made.candidate.candidateId,
    });
    expect(await f.revisions.append(input)).toEqual({ kind: 'conflict', reason: 'STALE_MANIFEST' });
    const manifest = await f.images.manifest(f.scope, 1);
    if (!manifest) throw new Error('TEST_MANIFEST');
    const current = {
      ...input,
      expectedManifestVersion: 1,
      expectedManifestDigest: manifest.digest,
    };
    const saved = await f.revisions.append(current);
    expect(saved.kind).toBe('saved');
    expect(await f.revisions.append(current)).toEqual(saved);
    expect(await f.revisions.append(input)).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
  });
  it('does not let reference replacement stale a locked derived picture', async () => {
    const f = await revisionControlFixture(pool),
      reference = await finishImage(
        f.images,
        imageRequestFor(f.revision, f.scope, f.authSessionId),
      );
    const select = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.revision.digest,
      expectedManifestVersion: 0,
      entityId: reference.candidate.entityId,
      purpose: 'image' as const,
      variant: 'reference' as const,
      label: null,
      candidateId: reference.candidate.candidateId,
    };
    const initial = await f.images.select(select);
    if (initial.kind !== 'saved') throw new Error('TEST_REFERENCE');
    const derived = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId, 1, 'iva', 'figure', {
        candidateId: reference.candidate.candidateId,
        contentHash: reference.candidate.contentHash,
        mediaType: 'image/png',
      }),
      1,
    );
    const chosen = await f.images.select({
      ...select,
      requestId: randomUUID(),
      expectedManifestVersion: 1,
      purpose: 'figure',
      variant: 'derived',
      label: 'figure',
      candidateId: derived.candidate.candidateId,
    });
    if (chosen.kind !== 'saved') throw new Error('TEST_FIGURE');
    expect(
      (
        await f.controls.replaceLocks({
          ...f.replace(),
          manifestVersion: 2,
          manifestDigest: chosen.manifest.digest,
          targets: [
            {
              kind: 'image',
              entityId: select.entityId,
              purpose: 'figure',
              variant: 'derived',
              label: 'figure',
            },
          ],
        })
      ).kind,
    ).toBe('saved');
    const replacement = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId, 2),
      2,
    );
    expect(
      await f.images.select({
        ...select,
        requestId: randomUUID(),
        expectedManifestVersion: 2,
        candidateId: replacement.candidate.candidateId,
      }),
    ).toEqual({ kind: 'conflict' });
    expect((await f.images.manifest(f.scope, 1))?.digest).toBe(chosen.manifest.digest);
  });
  it('replays historical fingerprints with no430receipt without inheriting current locks', async () => {
    const f = await revisionControlFixture(pool),
      legacy = f.append();
    legacy.content.world.opening += ' legacy';
    await pool.query(
      `INSERT INTO ltw_campaign_package_revisions(draft_id,owner_id,revision,based_on_revision,request_id,
      request_fingerprint,content,identities,digest,source,created_at) VALUES($1,$2,2,1,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9)`,
      [
        f.scope.draftId,
        f.scope.ownerId,
        legacy.requestId,
        campaignRequestFingerprint(legacy),
        JSON.stringify(legacy.content),
        JSON.stringify(f.revision.identities),
        campaignContentDigest(legacy.content, f.revision.identities),
        JSON.stringify(legacy.source),
        legacy.createdAt,
      ],
    );
    const head = await f.revisions.get(f.scope.ownerId, f.scope.draftId, 2);
    if (!head) throw new Error('TEST_HEAD');
    const manifest = await f.images.manifest(f.scope, 2);
    if (!manifest) throw new Error('TEST_MANIFEST');
    await f.controls.replaceLocks({
      ...f.replace(),
      revision: 2,
      packageDigest: head.digest,
      manifestDigest: manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    });
    const result = await f.revisions.append(legacy);
    expect(result.kind).toBe('saved');
    if (result.kind === 'saved') expect(result.revision.revision).toBe(2);
    expect(await f.revisions.append({ ...legacy, expectedLockVersion: 1 })).toEqual({
      kind: 'conflict',
      reason: 'REQUEST_REUSED',
    });
  });
  it('restores as a new revision, preserves IDs and replays receipts after the head moves', async () => {
    const f = await revisionControlFixture(pool),
      request = restoreIntent(f);
    const restored = await f.controls.restore(request);
    expect(restored.kind).toBe('saved');
    if (restored.kind !== 'saved') throw new Error('TEST_RESTORE');
    expect(restored.revision.revision).toBe(2);
    expect(restored.revision.identities).toEqual(f.revision.identities);
    expect(restored.revision.source).toEqual({ kind: 'OWNER', actorId: f.scope.ownerId });
    expect(await f.controls.restore(request)).toEqual(restored);
    expect(await f.controls.restore({ ...request, restoreRevision: 2 })).toEqual({
      kind: 'conflict',
      reason: 'REQUEST_REUSED',
    });
    expect((await f.images.manifest(f.scope, 2))?.version).toBe(0);
  });
  it('adopts stored provenance atomically without mutating the terminal generation job', async () => {
    const f = await revisionControlFixture(pool),
      content = structuredClone(f.revision.content);
    content.world.opening += ' revised';
    const request = await candidate(f, content),
      adopted = await f.controls.adopt(request);
    expect(adopted.kind).toBe('saved');
    if (adopted.kind !== 'saved') throw new Error('TEST_ADOPTION');
    expect(adopted.revision.source.kind).toBe('AI');
    expect(adopted.revision.revision).toBe(2);
    expect(await f.controls.adopt(request)).toEqual(adopted);
    expect(
      await f.controls.adopt({ ...request, candidateDigest: imageDigest({ other: true }) }),
    ).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
    expect(
      (
        await pool.query<{ attached_revision: number | null }>(
          'SELECT attached_revision FROM ltw_campaign_generation_jobs WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3',
          [f.scope.ownerId, f.scope.draftId, request.jobId],
        )
      ).rows[0]?.attached_revision,
    ).toBeNull();
  });
  it('rolls back identities, revision, manifest and receipt when candidate assessment is invalid', async () => {
    const f = await revisionControlFixture(pool),
      content = structuredClone(f.revision.content);
    content.world.startLocation = 'absent-place';
    content.entities.push({ ...entity(content), key: 'uncommitted-candidate' });
    const request = await candidate(f, content),
      before = await counts(f);
    expect(await f.controls.adopt(request)).toEqual({
      kind: 'conflict',
      reason: 'INVALID_CANDIDATE',
    });
    expect(await counts(f)).toEqual(before);
  });
  it('rejects stale review and revoked current sessions, with no historical mutation', async () => {
    const f = await revisionControlFixture(pool),
      request = restoreIntent(f),
      before = await counts(f);
    expect(
      await f.controls.restore({ ...request, reviewDigest: imageDigest({ changed: true }) }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_REVIEW' });
    await pool.query(
      'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE owner_id=$1 AND session_id=$2',
      [f.scope.ownerId, f.authSessionId],
    );
    expect(await f.controls.restore(request)).toEqual({ kind: 'conflict', reason: 'STALE_REVIEW' });
    expect(await f.controls.replaceLocks(f.replace())).toEqual({
      kind: 'conflict',
      reason: 'STALE_REVIEW',
    });
    expect(await counts(f)).toEqual(before);
    await expect(
      pool.query('DELETE FROM ltw_campaign_draft_lock_versions WHERE owner_id=$1 AND draft_id=$2', [
        f.scope.ownerId,
        f.scope.draftId,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(
        'DELETE FROM ltw_campaign_revision_write_receipts WHERE owner_id=$1 AND draft_id=$2',
        [f.scope.ownerId, f.scope.draftId],
      ),
    ).rejects.toThrow();
  });
});
