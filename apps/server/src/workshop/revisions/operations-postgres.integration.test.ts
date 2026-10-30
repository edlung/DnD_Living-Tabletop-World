import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCampaignEditPlan } from '@ltw/domain';

import { hashToken, newToken } from '../../auth/tokens.ts';
import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { revisionControlFixture } from '../../testing/revision-controls-postgres.ts';
import { imageDigest } from '../images/manifest.ts';
import { revisionReviewDigest } from './policy.ts';

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

describe('revision operation provenance and policy races', () => {
  it('revalidates the frozen edit boundary before adopting a stored EDIT candidate', async () => {
    const f = await revisionControlFixture(pool);
    const planned = buildCampaignEditPlan(
      f.revision,
      f.locks,
      { version: 0, digest: f.manifest.digest },
      'Change only the opening',
      ['section:world'],
    );
    if (!planned.spec) throw new Error('TEST_EDIT_PLAN');
    const candidate = structuredClone(f.revision.content);
    candidate.world.opening += ' edited';
    const actor = candidate.entities.find((e) => e.key === 'iva');
    if (!actor) throw new Error('TEST_ENTITY');
    actor.description += ' outside approved scope';
    const jobId = randomUUID(),
      source = { kind: 'AI', jobId, traceId: randomUUID(), provider: 'test', model: 'offline' };
    await pool.query(
      `INSERT INTO ltw_campaign_generation_jobs(job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,
      base_revision,seed,status,next_step,created_at,updated_at,candidate_available,mode,lock_version,edit_spec)
      VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,'SUCCEEDED',1,clock_timestamp(),clock_timestamp(),true,'EDIT',0,$8::jsonb)`,
      [
        jobId,
        f.scope.ownerId,
        f.scope.draftId,
        f.authSessionId,
        randomUUID(),
        imageDigest({ jobId }),
        JSON.stringify(f.revision.content),
        JSON.stringify(planned.spec),
      ],
    );
    await pool.query(
      `INSERT INTO ltw_campaign_generation_candidates(owner_id,draft_id,job_id,content,content_digest,source,created_at)
      VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,clock_timestamp())`,
      [
        f.scope.ownerId,
        f.scope.draftId,
        jobId,
        JSON.stringify(candidate),
        imageDigest(candidate),
        JSON.stringify(source),
      ],
    );
    const request = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      packageDigest: f.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      jobId,
      candidateDigest: imageDigest(candidate),
      reviewDigest: revisionReviewDigest({
        kind: 'ADOPTION',
        sourceId: jobId,
        sourceDigest: imageDigest(candidate),
        headDigest: f.revision.digest,
        lockDigest: f.locks.digest,
        manifestDigest: f.manifest.digest,
      }),
    };
    expect(await f.controls.adopt(request)).toEqual({
      kind: 'conflict',
      reason: 'INVALID_CANDIDATE',
    });
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
    expect(await f.controls.adopt({ ...request, ownerId: randomUUID() })).toEqual({
      kind: 'not-found',
    });
    const foreign = await revisionControlFixture(pool);
    expect(
      await foreign.controls.adopt({
        ...request,
        ...foreign.scope,
        authSessionId: foreign.authSessionId,
        packageDigest: foreign.revision.digest,
        manifestDigest: foreign.manifest.digest,
      }),
    ).toEqual({ kind: 'not-found' });
  });
  it('adopts using the current owner session after the job session was revoked', async () => {
    const f = await revisionControlFixture(pool),
      jobId = randomUUID(),
      traceId = randomUUID();
    const source = { kind: 'AI', jobId, traceId, provider: 'test', model: 'offline' },
      content = structuredClone(f.revision.content);
    content.world.opening += ' revised';
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
    await pool.query(
      `INSERT INTO ltw_campaign_generation_candidates(owner_id,draft_id,job_id,content,content_digest,source,created_at)
      VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,clock_timestamp())`,
      [
        f.scope.ownerId,
        f.scope.draftId,
        jobId,
        JSON.stringify(content),
        imageDigest(content),
        JSON.stringify(source),
      ],
    );
    const authSessionId = randomUUID(),
      token = newToken(),
      at = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 86400000).toISOString();
    await f.workshop.issueInvitation({
      ownerId: f.scope.ownerId,
      invitationId: randomUUID(),
      tokenHash: hashToken(token),
      createdAt: at,
      expiresAt,
      authorizationSource: 'test:430-current-session',
    });
    await f.workshop.redeem(
      hashToken(token),
      { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt: at, expiresAt },
      null,
    );
    await pool.query(
      'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE owner_id=$1 AND session_id=$2',
      [f.scope.ownerId, f.authSessionId],
    );
    const input = {
      ...f.scope,
      authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      packageDigest: f.revision.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      jobId,
      candidateDigest: imageDigest(content),
      reviewDigest: revisionReviewDigest({
        kind: 'ADOPTION',
        sourceId: jobId,
        sourceDigest: imageDigest(content),
        headDigest: f.revision.digest,
        lockDigest: f.locks.digest,
        manifestDigest: f.manifest.digest,
      }),
    };
    expect((await f.controls.adopt(input)).kind).toBe('saved');
    expect(await f.controls.adopt({ ...input, authSessionId: f.authSessionId })).toEqual({
      kind: 'conflict',
      reason: 'STALE_REVIEW',
    });
    expect(await f.controls.adopt(input)).toMatchObject({
      kind: 'saved',
      revision: { revision: 2, source },
    });
  });
  it('retains content locks across head changes and blocks restoring their older values', async () => {
    const f = await revisionControlFixture(pool),
      edit = f.append();
    edit.content.world.opening += ' new protected opening';
    const saved = await f.revisions.append(edit);
    if (saved.kind !== 'saved') throw new Error('TEST_SAVE');
    const manifest = await f.images.manifest(f.scope, 2);
    if (!manifest) throw new Error('TEST_MANIFEST');
    const installed = await f.controls.replaceLocks({
      ...f.replace(),
      revision: 2,
      packageDigest: saved.revision.digest,
      manifestDigest: manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    });
    if (installed.kind !== 'saved') throw new Error('TEST_LOCK');
    const restore = {
      ...f.scope,
      authSessionId: f.authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 2,
      packageDigest: saved.revision.digest,
      expectedLockVersion: 1,
      manifestVersion: 0,
      manifestDigest: manifest.digest,
      restoreRevision: 1,
      reviewDigest: revisionReviewDigest({
        kind: 'RESTORE',
        sourceId: '1',
        sourceDigest: f.revision.digest,
        headDigest: saved.revision.digest,
        lockDigest: installed.locks.digest,
        manifestDigest: manifest.digest,
      }),
    };
    expect(await f.controls.restore(restore)).toEqual({
      kind: 'conflict',
      reason: 'LOCKED_CONTENT',
    });
    expect((await f.revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(2);
    expect((await f.controls.locks(f.scope))?.digest).toBe(installed.locks.digest);
    const unlocked = await f.controls.replaceLocks({
      ...f.replace(),
      revision: 2,
      packageDigest: saved.revision.digest,
      manifestDigest: manifest.digest,
      expectedLockVersion: 1,
    });
    expect(unlocked.kind).toBe('saved');
    expect(await f.controls.restore(restore)).toEqual({ kind: 'conflict', reason: 'STALE_LOCKS' });
  });
  it('keeps newly added generation mode and lock columns immutable', async () => {
    const f = await revisionControlFixture(pool),
      jobId = randomUUID();
    await pool.query(
      `INSERT INTO ltw_campaign_generation_jobs(job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,
      base_revision,seed,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,'QUEUED',clock_timestamp(),clock_timestamp())`,
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
    for (const update of ["mode='EDIT',edit_spec='{}'::jsonb", 'lock_version=1'])
      await expect(
        pool.query(
          `UPDATE ltw_campaign_generation_jobs SET ${update} WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
          [f.scope.ownerId, f.scope.draftId, jobId],
        ),
      ).rejects.toThrow('generation identity');
  });
});
