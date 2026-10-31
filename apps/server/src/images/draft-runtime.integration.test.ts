import { randomUUID } from 'node:crypto';

import type { CampaignRevision } from '@ltw/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setMonetaryPolicy } from '../ai/accounting/monetary-policy.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { Secret } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { TEST_AUTH, accountingDb, type AccountingDb } from '../testing/accounting.ts';
import { emptyCampaignPackage } from '../testing/campaign-packages.ts';
import { grantTestPictures } from '../testing/picture-grant.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { STYLE, answer, picture, dataUrl } from '../testing/image-provider.ts';
import { PostgresWorkshopStore } from '../workshop/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../workshop/packages/postgres-store.ts';
import { PostgresDraftImageRepository } from '../workshop/images/postgres-store.ts';
import { draftImageSourceSignature } from '../workshop/images/manifest.ts';
import type { DraftImageLease } from '../workshop/images/store.ts';
import { createDraftImageRuntime } from './draft-runtime.ts';
import type { DraftImageInput } from './draft-input.ts';
import { PostgresImageLedger, setImageCeiling, imageBudgetStatus } from './ledger.ts';
import { openImageReservations } from './ledger-operator.ts';

let db: AccountingDb;
let ownerId: string, draftId: string, authSessionId: string;
let repository: PostgresDraftImageRepository;
let revision: CampaignRevision;
let input: DraftImageInput;
let lease: DraftImageLease;
let requestDigest: string;
const logger = createLogger({ service: 'draft-image-integration', level: 'silent' });
const config = {
  assets: {
    workerIntervalMs: 10,
    generationTimeoutMs: 5000,
    generator: {
      kind: 'openrouter-openai' as const,
      apiKey: new Secret('TEST_ONLY'),
      model: 'openai/gpt-5.4-image-2' as const,
    },
  },
};
beforeEach(async () => {
  db = await accountingDb();
  ownerId = randomUUID();
  draftId = randomUUID();
  authSessionId = randomUUID();
  const workshop = new PostgresWorkshopStore(db.pool);
  const invitationHash = hashToken(newToken());
  const createdAt = new Date().toISOString(),
    expiresAt = new Date(Date.now() + 3600000).toISOString();
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash: invitationHash,
    createdAt,
    expiresAt,
    authorizationSource: 'test:420',
  });
  await workshop.redeem(
    invitationHash,
    { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt, expiresAt },
    null,
  );
  await grantTestPictures(db.pool, ownerId);
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Private images', language: 'en' },
    draftId,
    createdAt,
  );
  const content = emptyCampaignPackage();
  content.entities.push({
    key: 'keeper',
    kind: 'npc',
    name: 'PRIVATE_NAME',
    description: 'PRIVATE_SECRET',
    status: 'active',
    existsSince: null,
  });
  content.visuals.push({
    entity: 'keeper',
    purpose: 'image',
    description: 'silver hair and a blue coat',
    style: 'watercolor',
  });
  const appended = await new PostgresCampaignRevisionRepository(db.pool).append({
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content,
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt,
  });
  if (appended.kind !== 'saved') throw new Error('REVISION_FIXTURE_FAILED');
  revision = appended.revision;
  repository = new PostgresDraftImageRepository(db.pool);
  const prepared = await runtime(() => jsonResponse({})).preparation.prepare({
    revision,
    entityId: revision.identities.entities['keeper'] ?? '',
    purpose: 'image',
    reference: null,
  });
  if (prepared.status !== 'PREPARED') throw new Error('PREPARE_FIXTURE_FAILED');
  input = prepared.input;
  requestDigest = prepared.requestDigest;
  const sourceSignature = draftImageSourceSignature(
    revision,
    {
      entityId: input.subject.entityId,
      purpose: input.purpose,
      variant: input.variant,
      label: input.label,
    },
    null,
  );
  if (!sourceSignature) throw new Error('SIGNATURE_FIXTURE_FAILED');
  const requested = await repository.request({
    ownerId,
    draftId,
    authSessionId,
    requestId: randomUUID(),
    revision: 1,
    packageDigest: revision.digest,
    expectedManifestVersion: 0,
    input,
    provider: prepared.provider,
    model: prepared.model,
    requestDigest,
    sourceSignature,
  });
  if (requested.kind !== 'saved') throw new Error('JOB_FIXTURE_FAILED');
  const claimed = await repository.claim(
    { ownerId, draftId, jobId: requested.job.jobId },
    randomUUID(),
  );
  if (claimed.kind !== 'claimed') throw new Error('CLAIM_FIXTURE_FAILED');
  lease = claimed.lease;
});
afterEach(async () => db.close());
function runtime(respond: Parameters<typeof fakeFetch>[0], styles = STYLE) {
  const transport = fakeFetch(respond);
  return {
    calls: transport.calls,
    preparation: createDraftImageRuntime({
      pool: db.pool,
      config,
      logger,
      contents: repository,
      styleReferences: styles,
      fetch: transport.fetchImpl,
    }),
  };
}
const unlimited = () =>
  setMonetaryPolicy(db.pool, { scope: 'images', mode: 'UNLIMITED', authorization: TEST_AUTH });
async function run(preparation: ReturnType<typeof runtime>['preparation'], current = lease) {
  const prepared = await preparation.forJob(current);
  if (!prepared) throw new Error('RUNTIME_BIND_FAILED');
  return prepared.run({
    input,
    chargeId: current.chargeId,
    signal: new AbortController().signal,
    beforeDispatch: async (proof) =>
      (await repository.beginDispatch(current, proof)) === 'DISPATCH',
  });
}

describe('real workshop image runtime and accounting', () => {
  it('exceeds an old zero ceiling under explicit unlimited policy, with durable gate and nullable campaign scope', async () => {
    await setImageCeiling(db.pool, 0n, TEST_AUTH);
    await unlimited();
    const png = await picture(8, 8);
    const { preparation, calls } = runtime(async () => {
      expect(
        (
          await db.pool.query('SELECT 1 FROM ltw_workshop_image_dispatches WHERE job_id=$1', [
            lease.jobId,
          ])
        ).rowCount,
      ).toBe(1);
      const charge = (
        await db.pool.query(
          'SELECT campaign_id,workshop_job_id,workshop_fence FROM ltw_image_charges WHERE charge_id=$1',
          [lease.chargeId],
        )
      ).rows[0] as Record<string, unknown>;
      expect(charge).toMatchObject({
        campaign_id: null,
        workshop_job_id: lease.jobId,
        workshop_fence: lease.fence,
      });
      return jsonResponse(answer(dataUrl(png)));
    });
    expect(await preparation.availability(ownerId)).toMatchObject({
      available: true,
      reason: 'READY',
    });
    const result = await run(preparation);
    expect(result.status).toBe('GENERATED');
    expect(calls).toHaveLength(1);
    if (!result.bytes || !result.mediaType) throw new Error('RESULT_MISSING');
    expect(
      await repository.complete(lease, {
        bytes: result.bytes,
        mediaType: result.mediaType,
        model: result.model,
      }),
    ).toMatchObject({ kind: 'stored' });
    expect((await imageBudgetStatus(db.pool)).spentMicros).toBe('41200');
    expect(await preparation.forJob(lease)).toBeNull();
    expect((await db.pool.query('SELECT count(*)::int AS count FROM ltw_events')).rows[0]).toEqual({
      count: 0,
    });
    expect(calls[0]?.body).not.toContain('PRIVATE_SECRET');
    expect(calls[0]?.body).not.toContain('PRIVATE_NAME');
  });

  it('refuses workshop images without unlimited policy, including a stored finite ceiling', async () => {
    await setImageCeiling(db.pool, 999999999n, TEST_AUTH);
    const { preparation, calls } = runtime(() => jsonResponse({}));
    expect(await preparation.availability(ownerId)).toMatchObject({
      available: false,
      reason: 'NO_POLICY',
    });
    expect(await run(preparation)).toMatchObject({
      status: 'UNAVAILABLE',
      execution: { outcome: 'not_dispatched' },
    });
    expect(calls).toHaveLength(0);
    expect((await imageBudgetStatus(db.pool)).charges).toBe(0);
  });

  it('refuses workshop images once the owner picture grant is disabled, before any charge (Gate 07, G07-02)', async () => {
    await unlimited();
    await grantTestPictures(db.pool, ownerId, false);
    const { preparation, calls } = runtime(() => jsonResponse({}));
    expect(await preparation.availability(ownerId)).toMatchObject({
      available: false,
      reason: 'NO_GRANT',
    });
    // The job was queued while granted: its reservation, the last gate, refuses it.
    expect((await run(preparation)).execution).toMatchObject({ outcome: 'not_dispatched' });
    expect(calls).toHaveLength(0);
    expect((await imageBudgetStatus(db.pool)).charges).toBe(0);
    await grantTestPictures(db.pool, ownerId);
    expect(await preparation.availability(ownerId)).toMatchObject({
      available: true,
      reason: 'READY',
    });
  });

  it('keeps missing usage charged at the full reservation without inventing a reported cost', async () => {
    await unlimited();
    const png = await picture(8, 8);
    const { preparation } = runtime(() => jsonResponse(answer(dataUrl(png), { usage: {} })));
    expect(await run(preparation)).toMatchObject({ status: 'GENERATED' });
    expect(
      (
        await db.pool.query(
          'SELECT charged_micros::text,cost_reported FROM ltw_image_settlements WHERE charge_id=$1',
          [lease.chargeId],
        )
      ).rows[0],
    ).toEqual({ charged_micros: '500000', cost_reported: false });
  });

  it('reconstructs a derived figure with the exact chosen private raster as its only input image', async () => {
    await unlimited();
    const png = await picture(8, 8);
    const { preparation, calls } = runtime(() => jsonResponse(answer(dataUrl(png))));
    const portrait = await run(preparation);
    if (!portrait.bytes || !portrait.mediaType) throw new Error('TEST_PORTRAIT_MISSING');
    const saved = await repository.complete(lease, {
      bytes: portrait.bytes,
      mediaType: portrait.mediaType,
      model: portrait.model,
    });
    if (saved.kind !== 'stored') throw new Error('TEST_CANDIDATE_MISSING');
    const candidate = saved.candidate;
    if (candidate.mediaType !== 'image/png' && candidate.mediaType !== 'image/webp')
      throw new Error('TEST_RASTER_MISSING');
    const selected = await repository.select({
      ownerId,
      draftId,
      authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: revision.digest,
      expectedManifestVersion: 0,
      entityId: input.subject.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: candidate.candidateId,
    });
    if (selected.kind !== 'saved') throw new Error('TEST_SELECTION_FAILED');
    const prepared = await preparation.prepare({
      revision,
      entityId: input.subject.entityId,
      purpose: 'figure',
      reference: {
        candidateId: candidate.candidateId,
        contentHash: candidate.contentHash,
        mediaType: candidate.mediaType,
        bytes: portrait.bytes,
      },
    });
    if (prepared.status !== 'PREPARED') throw new Error('TEST_FIGURE_PREPARATION_FAILED');
    const signature = draftImageSourceSignature(
      revision,
      { entityId: input.subject.entityId, purpose: 'figure', variant: 'derived', label: 'figure' },
      candidate.contentHash,
    );
    if (!signature) throw new Error('TEST_SIGNATURE_FAILED');
    const requested = await repository.request({
      ownerId,
      draftId,
      authSessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: revision.digest,
      expectedManifestVersion: selected.manifest.version,
      input: prepared.input,
      provider: prepared.provider,
      model: prepared.model,
      requestDigest: prepared.requestDigest,
      sourceSignature: signature,
    });
    if (requested.kind !== 'saved') throw new Error('TEST_FIGURE_JOB_FAILED');
    const claim = await repository.claim(
      { ownerId, draftId, jobId: requested.job.jobId },
      randomUUID(),
    );
    if (claim.kind !== 'claimed') throw new Error('TEST_FIGURE_CLAIM_FAILED');
    const runner = await preparation.forJob(claim.lease);
    if (!runner) throw new Error('TEST_FIGURE_RUNTIME_FAILED');
    const figure = await runner.run({
      input: prepared.input,
      chargeId: claim.lease.chargeId,
      signal: new AbortController().signal,
      beforeDispatch: async (proof) =>
        (await repository.beginDispatch(claim.lease, proof)) === 'DISPATCH',
    });
    expect(figure.status).toBe('GENERATED');
    const body = JSON.parse(calls[1]?.body ?? '{}') as {
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    };
    const images = body.messages[1]?.content.filter((part) => part.type === 'image_url');
    expect(images).toEqual([
      { type: 'image_url', image_url: { url: dataUrl(portrait.bytes, candidate.mediaType) } },
    ]);
    expect((await imageBudgetStatus(db.pool)).charges).toBe(2);
  });

  it('rejects foreign owner, stale fence/charge, changed worker and revoked origin session', async () => {
    await unlimited();
    const { preparation, calls } = runtime(() => jsonResponse({}));
    for (const changed of [
      { ownerId: randomUUID() },
      { fence: '999' },
      { chargeId: randomUUID() },
      { workerId: randomUUID() },
      { authSessionId: randomUUID() },
    ])
      expect(await preparation.forJob({ ...lease, ...changed })).toBeNull();
    const bound = await preparation.forJob(lease);
    if (!bound) throw new Error('RUNTIME_BIND_FAILED');
    await db.pool.query(
      'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE session_id=$1',
      [authSessionId],
    );
    expect(await preparation.forJob(lease)).toBeNull();
    expect(
      await bound.run({
        input,
        chargeId: lease.chargeId,
        signal: new AbortController().signal,
        beforeDispatch: () => Promise.resolve(true),
      }),
    ).toMatchObject({ status: 'UNAVAILABLE', execution: { outcome: 'not_dispatched' } });
    expect(calls).toHaveLength(0);
  });

  it('rejects request/style drift before reservation or marker', async () => {
    await unlimited();
    const changedStyle = { ...STYLE, person: [new Uint8Array([9, 9])] };
    const { preparation, calls } = runtime(() => jsonResponse({}), changedStyle);
    expect(await run(preparation)).toMatchObject({ status: 'UNAVAILABLE' });
    const exact = runtime(() => jsonResponse({}));
    const prepared = await exact.preparation.forJob(lease);
    if (!prepared) throw new Error('RUNTIME_BIND_FAILED');
    expect(
      await prepared.run({
        input: { ...input, style: 'changed' },
        chargeId: lease.chargeId,
        signal: new AbortController().signal,
        beforeDispatch: () => Promise.resolve(true),
      }),
    ).toMatchObject({ status: 'UNAVAILABLE' });
    expect((await imageBudgetStatus(db.pool)).charges).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('uses a new charge for safe lease takeover and never reuses the stale claim', async () => {
    await unlimited();
    const ledger = new PostgresImageLedger(db.pool);
    expect(
      await ledger.reserve({
        chargeId: lease.chargeId,
        subject: { kind: 'workshop', ...lease },
        requestId: lease.jobId,
        provider: 'openrouter-openai',
        model: config.assets.generator.model,
        reserveMicros: 500000n,
      }),
    ).toBe('reserved');
    await db.pool.query(
      "UPDATE ltw_workshop_image_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
      [lease.jobId],
    );
    const takeover = await repository.claim(lease, randomUUID());
    if (takeover.kind !== 'claimed') throw new Error('TAKEOVER_FAILED');
    expect(takeover.lease.chargeId).not.toBe(lease.chargeId);
    const png = await picture(8, 8);
    const { preparation, calls } = runtime(() => jsonResponse(answer(dataUrl(png))));
    expect(await preparation.forJob(lease)).toBeNull();
    expect(await run(preparation, takeover.lease)).toMatchObject({ status: 'GENERATED' });
    expect(calls).toHaveLength(1);
    expect(await imageBudgetStatus(db.pool)).toMatchObject({ charges: 2, heldMicros: '500000' });
    const orphan = (await openImageReservations(db.pool, 0)).find(
      (item) => item.chargeId === lease.chargeId,
    );
    expect(orphan).toMatchObject({
      campaignId: null,
      subject: { jobId: lease.jobId, fence: lease.fence },
    });
  });

  it('releases a reservation when revocation prevents the durable gate before transport', async () => {
    await unlimited();
    const { preparation, calls } = runtime(() => jsonResponse({}));
    const bound = await preparation.forJob(lease);
    if (!bound) throw new Error('RUNTIME_BIND_FAILED');
    const result = await bound.run({
      input,
      chargeId: lease.chargeId,
      signal: new AbortController().signal,
      beforeDispatch: async (proof) => {
        await db.pool.query(
          'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE session_id=$1',
          [authSessionId],
        );
        return (await repository.beginDispatch(lease, proof)) === 'DISPATCH';
      },
    });
    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      execution: { outcome: 'not_dispatched' },
    });
    expect(calls).toHaveLength(0);
    expect(
      (
        await db.pool.query(
          'SELECT charged_micros::text,cost_reported FROM ltw_image_settlements WHERE charge_id=$1',
          [lease.chargeId],
        )
      ).rows[0],
    ).toEqual({ charged_micros: '0', cost_reported: false });
    expect(
      (
        await db.pool.query('SELECT 1 FROM ltw_workshop_image_dispatches WHERE job_id=$1', [
          lease.jobId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it('preserves uncertain transport and cannot dispatch the same job again', async () => {
    await unlimited();
    const { preparation, calls } = runtime(() => Promise.reject(new Error('NETWORK_LOST')));
    expect(await run(preparation)).toMatchObject({
      status: 'DISPATCH_UNKNOWN',
      execution: { chargeId: lease.chargeId, outcome: 'dispatch_unknown' },
    });
    await repository.fail(lease, 'DISPATCH_UNKNOWN', true);
    expect(await preparation.forJob(lease)).toBeNull();
    expect(await repository.claim(lease, randomUUID())).toEqual({ kind: 'unavailable' });
    expect(calls).toHaveLength(1);
    expect((await imageBudgetStatus(db.pool)).spentMicros).toBe('500000');
  });
});
