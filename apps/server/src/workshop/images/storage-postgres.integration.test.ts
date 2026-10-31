import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../../auth/tokens.ts';
import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { englishBellCampaign } from '../../testing/generation/bell-english.ts';
import { grantTestPictures } from '../../testing/picture-grant.ts';
import { finishImage, imageRequestFor, TEST_DRAFT_PNG } from '../../testing/draft-image-fixture.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../packages/postgres-store.ts';
import { issueWorkshopInvitation } from '../service.ts';
import { PostgresDraftImageRepository } from './postgres-store.ts';
import type { DraftImageJobScope, SelectDraftImage } from './store.ts';
import { WORKSHOP_JOB_LIMITS } from '../job-limits.ts';

const cleanup: (() => Promise<unknown>)[] = [];
let pool: pg.Pool;
let images: PostgresDraftImageRepository;
let revisions: PostgresCampaignRevisionRepository;
let workshop: PostgresWorkshopStore;
let at: string;
beforeEach(async () => {
  const db = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => db.drop());
  pool = new pg.Pool({ connectionString: db.url, max: 5 });
  const connections = pool;
  cleanup.push(() => connections.end());
  images = new PostgresDraftImageRepository(pool);
  revisions = new PostgresCampaignRevisionRepository(pool);
  workshop = new PostgresWorkshopStore(pool);
  at =
    (
      await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
    ).rows[0]?.now.toISOString() ?? '';
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    authSessionId = randomUUID();
  const invite = await issueWorkshopInvitation(
    {
      store: workshop,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse(at) },
    },
    { ownerId, hours: 24, authorizationSource: 'test:420-images' },
  );
  await workshop.redeem(
    hashToken(invite.link.split('#')[1] ?? ''),
    {
      sessionId: authSessionId,
      tokenHash: hashToken(newToken()),
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 86400000).toISOString(),
    },
    null,
  );
  await grantTestPictures(pool, ownerId);
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'en' },
    draftId,
    at,
  );
  const saved = await revisions.append({
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: englishBellCampaign(),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: at,
  });
  if (saved.kind !== 'saved') throw new Error('TEST_REVISION');
  const scope = { ownerId, draftId };
  return {
    scope,
    authSessionId,
    revision: saved.revision,
    request: () => imageRequestFor(saved.revision, scope, authSessionId),
  };
}
function selection(
  f: Awaited<ReturnType<typeof fixture>>,
  candidate: Awaited<ReturnType<typeof finishImage>>['candidate'],
  version = 0,
): SelectDraftImage {
  return {
    ...f.scope,
    authSessionId: f.authSessionId,
    requestId: randomUUID(),
    revision: 1,
    packageDigest: f.revision.digest,
    expectedManifestVersion: version,
    entityId: candidate.entityId,
    purpose: candidate.purpose,
    variant: candidate.variant,
    label: candidate.label,
    candidateId: candidate.candidateId,
  };
}
async function expire(scope: DraftImageJobScope) {
  await pool.query(
    `UPDATE ltw_workshop_image_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    [scope.ownerId, scope.draftId, scope.jobId],
  );
}

describe('PostgreSQL private draft images', () => {
  it('bounds an owner to four active pictures and queues nothing for an ungranted owner (Gate 07)', async () => {
    const f = await fixture();
    for (let index = 0; index < WORKSHOP_JOB_LIMITS.picturesPerOwner; index++)
      expect((await images.request(f.request())).kind).toBe('saved');
    expect((await images.request(f.request())).kind).toBe('busy');
    const ungranted = await fixture();
    await grantTestPictures(pool, ungranted.scope.ownerId, false);
    expect((await images.request(ungranted.request())).kind).toBe('no-grant');
    expect(await images.list(ungranted.scope, 1, 10)).toEqual([]);
  });

  it('replays requests before manifest CAS and rejects changed intent, forged source or appearance', async () => {
    const f = await fixture();
    const request = f.request();
    const result = await finishImage(images, request);
    await images.select(selection(f, result.candidate));
    const replay = await images.request(request);
    expect(replay.kind).toBe('saved');
    if (replay.kind !== 'saved') throw new Error('TEST_REPLAY');
    expect(replay.job.jobId).toBe(result.scope.jobId);
    expect(await images.requestById(f.scope, request.requestId)).toMatchObject({
      jobId: result.scope.jobId,
      requestId: request.requestId,
      expectedManifestVersion: 0,
      packageDigest: request.packageDigest,
    });
    expect(
      await images.requestById({ ...f.scope, ownerId: randomUUID() }, request.requestId),
    ).toBeNull();
    expect(
      await images.request({ ...request, input: { ...request.input, note: 'Changed' } }),
    ).toEqual({ kind: 'conflict' });
    expect(
      await images.request({
        ...request,
        requestId: randomUUID(),
        expectedManifestVersion: 1,
        sourceSignature: `sha256:${'0'.repeat(64)}`,
      }),
    ).toEqual({ kind: 'conflict' });
    expect(
      await images.request({
        ...request,
        requestId: randomUUID(),
        expectedManifestVersion: 1,
        input: { ...request.input, appearance: 'Not the stored visual' },
      }),
    ).toEqual({ kind: 'conflict' });
  });
  it('qualifies job, candidate, bytes, manifest, request, claim and selection by owner and draft', async () => {
    const f = await fixture();
    const other = await fixture();
    const result = await finishImage(images, f.request());
    const foreign = { ownerId: other.scope.ownerId, draftId: f.scope.draftId };
    expect(await images.get({ ...foreign, jobId: result.scope.jobId })).toBeNull();
    expect(await images.candidate(foreign, result.candidate.candidateId)).toBeNull();
    expect(await images.content(foreign, result.candidate.contentHash)).toBeNull();
    expect(await images.manifest(foreign, 1)).toBeNull();
    expect(await images.list(foreign, 1, 10)).toEqual([]);
    expect(await images.candidates(foreign, 1, 10)).toEqual([]);
    expect(
      await images.request({ ...f.request(), ...foreign, authSessionId: other.authSessionId }),
    ).toEqual({ kind: 'not-found' });
    expect(await images.claim({ ...foreign, jobId: result.scope.jobId }, randomUUID())).toEqual({
      kind: 'unavailable',
    });
    expect(await images.cancel({ ...foreign, jobId: result.scope.jobId })).toEqual({
      kind: 'not-found',
    });
    expect(
      await images.select({
        ...selection(f, result.candidate),
        ...foreign,
        authSessionId: other.authSessionId,
      }),
    ).toEqual({ kind: 'not-found' });
  });
  it('serializes claims and allocates a fresh charge per safe fence takeover', async () => {
    const f = await fixture();
    const request = f.request();
    const saved = await images.request(request);
    if (saved.kind !== 'saved') throw new Error('TEST_REQUEST');
    const scope = { ...f.scope, jobId: saved.job.jobId };
    const claims = await Promise.all([
      images.claim(scope, randomUUID()),
      new PostgresDraftImageRepository(pool).claim(scope, randomUUID()),
    ]);
    expect(claims.filter((c) => c.kind === 'claimed')).toHaveLength(1);
    const first = claims.find((c) => c.kind === 'claimed');
    if (first?.kind !== 'claimed') throw new Error('TEST_CLAIM');
    expect(await images.renew(first.lease)).toBe(true);
    await expire(scope);
    const next = await images.claim(scope, randomUUID());
    if (next.kind !== 'claimed') throw new Error('TEST_TAKEOVER');
    expect(next.lease.chargeId).not.toBe(first.lease.chargeId);
    expect(BigInt(next.lease.fence)).toBeGreaterThan(BigInt(first.lease.fence));
    expect(
      await images.beginDispatch(first.lease, {
        chargeId: first.lease.chargeId,
        requestDigest: request.requestDigest,
      }),
    ).toBe('FENCED');
    expect(
      await images.beginDispatch(next.lease, {
        chargeId: next.lease.chargeId,
        requestDigest: `sha256:${'1'.repeat(64)}`,
      }),
    ).toBe('FENCED');
    expect(
      await images.beginDispatch(next.lease, {
        chargeId: next.lease.chargeId,
        requestDigest: request.requestDigest,
      }),
    ).toBe('DISPATCH');
    expect(
      await images.beginDispatch(next.lease, {
        chargeId: next.lease.chargeId,
        requestDigest: request.requestDigest,
      }),
    ).toBe('UNKNOWN');
    await expire(scope);
    expect(await images.claim(scope, randomUUID())).toEqual({ kind: 'unavailable' });
    expect((await images.get(scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect(
      await images.complete(next.lease, {
        bytes: TEST_DRAFT_PNG,
        mediaType: 'image/png',
        model: request.model,
      }),
    ).toEqual({ kind: 'fenced' });
  });
  it('stores candidate and exact bytes atomically without choosing and reuses a lost completion acknowledgement', async () => {
    const f = await fixture();
    const request = f.request();
    const result = await finishImage(images, request);
    images = new PostgresDraftImageRepository(pool);
    expect(
      await images.complete(result.lease, {
        bytes: result.bytes,
        mediaType: 'image/png',
        model: request.model,
      }),
    ).toEqual({ kind: 'stored', candidate: result.candidate });
    expect(
      await images.complete(result.lease, {
        bytes: new Uint8Array([...result.bytes, 9]),
        mediaType: 'image/png',
        model: request.model,
      }),
    ).toEqual({ kind: 'conflict' });
    expect((await images.content(f.scope, result.candidate.contentHash))?.bytes).toEqual(
      result.bytes,
    );
    expect(await images.candidate(f.scope, result.candidate.candidateId)).toEqual(result.candidate);
    expect((await images.manifest(f.scope, 1))?.entries).toEqual([]);
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_workshop_image_contents')).rows[0],
    ).toEqual({ n: 1 });
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_workshop_image_candidates')).rows[0],
    ).toEqual({ n: 1 });
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM ltw_events')).rows[0]).toEqual({
      n: 0,
    });
  });
  it('fences revoked sessions and cancellation against late completion', async () => {
    const f = await fixture();
    const request = f.request();
    const created = await images.request(request);
    if (created.kind !== 'saved') throw new Error('TEST_JOB');
    const scope = { ...f.scope, jobId: created.job.jobId };
    const claimed = await images.claim(scope, randomUUID());
    if (claimed.kind !== 'claimed') throw new Error('TEST_CLAIM');
    await pool.query(
      'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE owner_id=$1 AND session_id=$2',
      [f.scope.ownerId, f.authSessionId],
    );
    expect(await images.renew(claimed.lease)).toBe(false);
    expect(
      await images.beginDispatch(claimed.lease, {
        chargeId: claimed.lease.chargeId,
        requestDigest: request.requestDigest,
      }),
    ).toBe('FENCED');
    expect(
      await images.complete(claimed.lease, {
        bytes: TEST_DRAFT_PNG,
        mediaType: 'image/png',
        model: request.model,
      }),
    ).toEqual({ kind: 'fenced' });
    const g = await fixture();
    const made = await images.request(g.request());
    if (made.kind !== 'saved') throw new Error('TEST_JOB');
    const scope2 = { ...g.scope, jobId: made.job.jobId };
    const lease = await images.claim(scope2, randomUUID());
    if (lease.kind !== 'claimed') throw new Error('TEST_CLAIM');
    await images.beginDispatch(lease.lease, {
      chargeId: lease.lease.chargeId,
      requestDigest: made.job.requestDigest,
    });
    const [cancelled, completed] = await Promise.all([
      images.cancel(scope2),
      images.complete(lease.lease, {
        bytes: TEST_DRAFT_PNG,
        mediaType: 'image/png',
        model: made.job.model,
      }),
    ]);
    if (completed.kind === 'stored') {
      expect(cancelled.kind).toBe('conflict');
      expect(await images.candidates(g.scope, 1, 10)).toHaveLength(1);
    } else {
      expect(completed.kind).toBe('fenced');
      expect(cancelled.kind).toBe('saved');
      expect(await images.candidates(g.scope, 1, 10)).toEqual([]);
    }
    expect((await images.manifest(g.scope, 1))?.entries).toEqual([]);
  });
  it('serializes selection CAS, replays its original manifest and freezes inheritance against late old-revision selection', async () => {
    const f = await fixture();
    const a = await finishImage(images, f.request(), 1);
    const b = await finishImage(images, f.request(), 2);
    const aChoice = selection(f, a.candidate);
    const bChoice = selection(f, b.candidate);
    const choices = await Promise.all([images.select(aChoice), images.select(bChoice)]);
    expect(choices.filter((c) => c.kind === 'saved')).toHaveLength(1);
    expect(choices.filter((c) => c.kind === 'conflict')).toHaveLength(1);
    const accepted = choices[0].kind === 'saved' ? aChoice : bChoice;
    const first = choices.find((c) => c.kind === 'saved');
    expect(await images.select(accepted)).toEqual(first);
    const second = await revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: { ...f.revision.content, firstSession: ['Unrelated change'] },
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: at,
    });
    if (second.kind !== 'saved') throw new Error('TEST_REVISION');
    const inherited = await images.manifest(f.scope, 2);
    expect(inherited?.version).toBe(0);
    expect(inherited?.entries[0]?.state).toBe('CURRENT');
    await images.select({
      ...accepted,
      requestId: randomUUID(),
      expectedManifestVersion: 1,
      candidateId: null,
    });
    expect(await images.manifest(f.scope, 2)).toEqual(inherited);
    expect(await images.select(accepted)).toEqual(first);
    const changed = structuredClone(second.revision.content);
    const iva = changed.entities.find((e) => e.key === 'iva');
    if (!iva) throw new Error('TEST_IVA');
    iva.description = 'A changed private motivation';
    await revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 2,
      content: changed,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: at,
    });
    expect((await images.manifest(f.scope, 3))?.entries[0]).toMatchObject({
      state: 'STALE',
      staleReason: 'SOURCE_CHANGED',
    });
  });
  it('requires the chosen reference and invalidates derived art when its exact reference changes', async () => {
    const f = await fixture();
    const reference = await finishImage(images, f.request(), 1);
    await images.select(selection(f, reference.candidate));
    const figureRequest = imageRequestFor(
      f.revision,
      f.scope,
      f.authSessionId,
      1,
      'iva',
      'figure',
      {
        candidateId: reference.candidate.candidateId,
        contentHash: reference.candidate.contentHash,
        mediaType: 'image/png',
      },
    );
    const figure = await finishImage(images, figureRequest, 2);
    await images.select(selection(f, figure.candidate, 1));
    expect(
      (await images.manifest(f.scope, 1))?.entries.filter((e) => e.state === 'CURRENT'),
    ).toHaveLength(2);
    const newer = await finishImage(images, { ...f.request(), expectedManifestVersion: 2 }, 3);
    await images.select(selection(f, newer.candidate, 2));
    expect(
      (await images.manifest(f.scope, 1))?.entries.find((e) => e.purpose === 'figure'),
    ).toMatchObject({ state: 'STALE', staleReason: 'REFERENCE_CHANGED' });
    expect(
      await images.select({ ...selection(f, figure.candidate, 3), requestId: randomUUID() }),
    ).toEqual({ kind: 'conflict' });
  });
  it('initializes a missing historical manifest EMPTY without inheriting a later parent choice', async () => {
    const f = await fixture();
    await revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: f.revision.content,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: at,
    });
    // Emulate a pre0019 revision: no visual manifest existed for this child.
    await pool.query(
      'ALTER TABLE ltw_workshop_visual_manifests DISABLE TRIGGER ltw_workshop_image_immutable',
    );
    await pool.query(
      'DELETE FROM ltw_workshop_visual_manifests WHERE owner_id=$1 AND draft_id=$2 AND revision=2',
      [f.scope.ownerId, f.scope.draftId],
    );
    await pool.query(
      'ALTER TABLE ltw_workshop_visual_manifests ENABLE TRIGGER ltw_workshop_image_immutable',
    );
    const later = await finishImage(images, f.request());
    await images.select(selection(f, later.candidate));
    expect((await images.manifest(f.scope, 1))?.entries).toHaveLength(1);
    expect(await images.manifest(f.scope, 2)).toMatchObject({ version: 0, entries: [] });
  });
  it('rolls back revision/identity allocation if the mandatory version0 manifest cannot commit', async () => {
    const f = await fixture();
    await pool.query(
      "CREATE FUNCTION reject_visual_manifest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$",
    );
    await pool.query(
      'CREATE TRIGGER reject_visual_manifest BEFORE INSERT ON ltw_workshop_visual_manifests FOR EACH ROW EXECUTE FUNCTION reject_visual_manifest()',
    );
    const content = structuredClone(f.revision.content);
    content.entities.push({
      key: 'new-object',
      kind: 'item',
      name: 'New',
      description: '',
      status: 'active',
      existsSince: null,
    });
    await expect(
      revisions.append({
        ...f.scope,
        requestId: randomUUID(),
        basedOnRevision: 1,
        content,
        source: { kind: 'OWNER', actorId: f.scope.ownerId },
        createdAt: at,
      }),
    ).rejects.toThrow('CAMPAIGN_PACKAGE_STORAGE_UNAVAILABLE');
    expect((await revisions.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT COUNT(*)::int AS n FROM ltw_campaign_package_identities WHERE owner_id=$1 AND draft_id=$2 AND local_key=$3',
          [f.scope.ownerId, f.scope.draftId, 'new-object'],
        )
      ).rows[0],
    ).toEqual({ n: 0 });
  });
  it('filters candidates before paging and keeps manifests/candidates/bytes immutable', async () => {
    const f = await fixture();
    const iva = await finishImage(images, f.request(), 1);
    await finishImage(images, imageRequestFor(f.revision, f.scope, f.authSessionId, 0, 'arden'), 2);
    const onlyIva = await images.candidates(f.scope, 1, 1, null, iva.candidate.entityId);
    expect(onlyIva).toEqual([iva.candidate]);
    const first = await images.list(f.scope, 1, 1);
    const second = await images.list(f.scope, 1, 1, first[0]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.jobId).not.toBe(second[0]?.jobId);
    for (const table of ['dispatches', 'contents', 'candidates'])
      for (const sql of [
        `DELETE FROM ltw_workshop_image_${table}`,
        `TRUNCATE ltw_workshop_image_${table}`,
      ])
        await expect(pool.query(sql)).rejects.toThrow();
    await expect(pool.query('DELETE FROM ltw_workshop_visual_manifests')).rejects.toThrow();
    await expect(
      pool.query("UPDATE ltw_workshop_image_jobs SET input='{}'::jsonb"),
    ).rejects.toThrow();
  });
});
