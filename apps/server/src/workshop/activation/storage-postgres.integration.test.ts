import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acceptedActivation,
  activationPgFixture,
  executeActivation,
  activationRequest,
} from '../../testing/activation-fixture.ts';
import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { PostgresCampaignInitialContentStore } from '../../campaigns/postgres-content.ts';
import { PostgresCampaignPublication } from '../../campaigns/postgres-publication.ts';
import { PostgresCampaignActivationRepository } from './postgres-store.ts';
import { imageDigest } from '../images/manifest.ts';
import { loadCampaignActivationReview } from './review.ts';

let pool: pg.Pool;
const cleanup: (() => Promise<unknown>)[] = [];
beforeEach(async () => {
  const database = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => database.drop());
  pool = new pg.Pool({ connectionString: database.url, max: 5 });
  const current = pool;
  cleanup.push(() => current.end());
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
type Fixture = Awaited<ReturnType<typeof activationPgFixture>>;
const input = (f: Fixture) => ({
  ...f.scope,
  authSessionId: f.authSessionId,
  request: f.request,
  frozen: f.frozen,
});
async function claim(f: Fixture) {
  const activation = await acceptedActivation(f.repository, input(f));
  const scope = { ...f.scope, activationId: activation.activationId },
    claimed = await f.repository.claim(scope, randomUUID());
  if (!claimed) throw new Error('TEST_CLAIM');
  return { ...claimed, scope };
}
async function publish(f: Fixture) {
  const accepted = await claim(f);
  await f.content.prepare(accepted.activation);
  for (const asset of accepted.activation.frozen.assets) {
    const bytes = await f.images.content(f.scope, asset.contentHash);
    if (!bytes) throw new Error('TEST_BYTES');
    await f.contents.put(accepted.activation.campaignId, bytes);
  }
  await f.repository.phase(accepted.lease, 'CONTENT_READY');
  const proof = await executeActivation(f.bootstrap, accepted.activation);
  await f.repository.phase(accepted.lease, 'BOOTSTRAPPED');
  expect(await f.repository.publish(accepted.lease, proof)).toBe(true);
  return accepted.activation;
}
describe('PostgreSQL durable campaign activation', () => {
  it('requires the exact chosen MIME even when an actual bootstrap and immutable content already exist', async () => {
    const f = await activationPgFixture(pool, true),
      accepted = await claim(f);
    await f.content.prepare(accepted.activation);
    await f.repository.phase(accepted.lease, 'CONTENT_READY');
    const proof = await executeActivation(f.bootstrap, accepted.activation);
    await f.repository.phase(accepted.lease, 'BOOTSTRAPPED');
    for (const asset of accepted.activation.frozen.assets) {
      const bytes = await f.images.content(f.scope, asset.contentHash);
      if (!bytes) throw new Error('TEST_BYTES');
      await f.contents.put(accepted.activation.campaignId, {
        bytes: bytes.bytes,
        mediaType: bytes.mediaType === 'image/png' ? 'image/webp' : 'image/png',
      });
    }
    expect(await f.repository.publish(accepted.lease, proof)).toBe(false);
    expect(await f.publication.state(accepted.activation.campaignId)).toBe('UNPUBLISHED');
    expect(
      await f.repository.ownedActivation(f.scope.ownerId, accepted.activation.activationId),
    ).toBeNull();
  });
  it('pages explicit published ownership links without hiding an older draft or exposing another owner', async () => {
    const f = await activationPgFixture(pool),
      first = await publish(f),
      draftId = randomUUID();
    await f.workshop.createDraft(
      f.scope.ownerId,
      { requestId: randomUUID(), title: 'Second owned campaign', language: 'en' },
      draftId,
      new Date().toISOString(),
    );
    const saved = await f.revisions.append({
      ownerId: f.scope.ownerId,
      draftId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      content: f.revision.content,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: new Date().toISOString(),
    });
    if (saved.kind !== 'saved') throw new Error('TEST_SECOND_DRAFT');
    const scope = { ownerId: f.scope.ownerId, draftId },
      reviewed = await loadCampaignActivationReview(f.deps, scope, { textOnly: true });
    if (!reviewed?.frozen) throw new Error('TEST_REVIEW');
    const second = await publish({
      ...f,
      scope,
      revision: saved.revision,
      review: reviewed.review,
      frozen: reviewed.frozen,
      request: activationRequest(reviewed.review),
    });
    const latest = await f.repository.owned(f.scope.ownerId, 1);
    expect(latest[0]?.activationId).toBe(second.activationId);
    const cursor = latest[0];
    if (!cursor) throw new Error('TEST_CURSOR');
    const older = await f.repository.owned(f.scope.ownerId, 1, cursor);
    expect(older[0]?.activationId).toBe(first.activationId);
    expect(await f.repository.owned(f.scope.ownerId, 1, older[0])).toEqual([]);
    expect(await f.repository.ownedActivation(randomUUID(), first.activationId)).toBeNull();
    expect(await f.repository.owned(randomUUID(), 10, cursor)).toEqual([]);
  });
  it('reserves one stable operation across concurrent nonce retries, restart and later draft edits', async () => {
    const f = await activationPgFixture(pool),
      request = input(f);
    const [a, b] = await Promise.all([
      f.repository.begin(request),
      new PostgresCampaignActivationRepository(pool).begin(request),
    ]);
    expect(a).toEqual(b);
    if (a.kind !== 'saved') throw new Error('TEST_ACTIVATION');
    const edit = structuredClone(f.revision.content);
    edit.world.opening += ' A later draft edit.';
    await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: edit,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: new Date().toISOString(),
    });
    const restarted = new PostgresCampaignActivationRepository(pool);
    expect(await restarted.begin(request)).toEqual(a);
    expect(await restarted.byRequest(f.scope, f.request.requestId)).toEqual(a.activation);
    expect(
      await restarted.begin({
        ...request,
        request: { ...f.request, textOnly: !f.request.textOnly },
      }),
    ).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
    expect(
      await restarted.begin({ ...request, request: { ...f.request, requestId: randomUUID() } }),
    ).toEqual({ kind: 'conflict', reason: 'ALREADY_ACTIVATED' });
    expect((await restarted.get(f.scope))?.frozen.revision).toEqual(f.revision);
    expect(
      (await pool.query<{ n: number }>('SELECT count(*)::int n FROM ltw_events')).rows[0]?.n,
    ).toBe(0);
    expect(await restarted.owned(f.scope.ownerId, 10)).toEqual([]);
  });
  it('rejects stale CAS, false review and unknown acknowledgements without reserving IDs', async () => {
    const f = await activationPgFixture(pool),
      request = input(f);
    expect(
      await f.repository.begin({ ...request, request: { ...f.request, revision: 999 } }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_REVISION' });
    expect(
      await f.repository.begin({ ...request, request: { ...f.request, expectedLockVersion: 1 } }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_LOCKS' });
    expect(
      await f.repository.begin({ ...request, request: { ...f.request, manifestVersion: 1 } }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_MANIFEST' });
    expect(
      await f.repository.begin({
        ...request,
        request: { ...f.request, reviewDigest: imageDigest({ stale: true }) },
      }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_REVIEW' });
    expect(
      await f.repository.begin({
        ...request,
        request: { ...f.request, acknowledgedFindingIds: [imageDigest({ unknown: true })] },
      }),
    ).toEqual({ kind: 'conflict', reason: 'ACKNOWLEDGEMENTS' });
    expect(await f.repository.get(f.scope)).toBeNull();
    expect(await f.repository.pending(10)).toEqual([]);
    expect(
      (
        await pool.query<{ n: number }>(
          'SELECT count(*)::int n FROM ltw_workshop_campaign_activations',
        )
      ).rows[0]?.n,
    ).toBe(0);
  });
  it('continues accepted USER intent after session revocation and fences an expired worker', async () => {
    const f = await activationPgFixture(pool),
      accepted = await claim(f);
    await f.workshop.revokeOwner(f.scope.ownerId, new Date().toISOString(), 'test:440-confirmed');
    expect(await f.repository.renew(accepted.lease)).toBe(true);
    expect(await f.repository.retry(accepted.scope, f.authSessionId)).toEqual({
      kind: 'conflict',
      reason: 'STALE_REVIEW',
    });
    await pool.query(
      `UPDATE ltw_workshop_campaign_activations SET lease_until=clock_timestamp()-interval '1 second'
      WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3`,
      [f.scope.ownerId, f.scope.draftId, accepted.activation.activationId],
    );
    const recovered = await new PostgresCampaignActivationRepository(pool).claim(
      accepted.scope,
      randomUUID(),
    );
    if (!recovered) throw new Error('TEST_RECOVERY');
    expect(BigInt(recovered.lease.fence)).toBeGreaterThan(BigInt(accepted.lease.fence));
    expect(await f.repository.phase(accepted.lease, 'BOOTSTRAPPED')).toBe(false);
    await f.content.prepare(accepted.activation);
    expect(await f.repository.phase(recovered.lease, 'CONTENT_READY')).toBe(true);
    const proof = await executeActivation(f.bootstrap, accepted.activation);
    expect(await f.repository.phase(recovered.lease, 'BOOTSTRAPPED')).toBe(true);
    expect(await f.repository.publish(accepted.lease, proof)).toBe(false);
    expect(await f.repository.publish(recovered.lease, proof)).toBe(true);
    expect(await f.publication.state(accepted.activation.campaignId)).toBe('PUBLISHED');
  });
  it('verifies actual command, content and bytes before one-way publication, then tolerates later normal play', async () => {
    const f = await activationPgFixture(pool, true),
      accepted = await claim(f),
      { activation, lease } = accepted;
    expect(await f.repository.publish(lease, { fingerprint: 'not-a-command', version: 1 })).toBe(
      false,
    );
    await f.content.prepare(activation);
    await f.repository.phase(lease, 'CONTENT_READY');
    const proof = await executeActivation(f.bootstrap, activation);
    await f.repository.phase(lease, 'BOOTSTRAPPED');
    expect(await f.bootstrap.load(activation.campaignId)).not.toBeNull();
    expect(await f.ordinary.load(activation.campaignId)).toBeNull();
    expect(await f.repository.publish(lease, proof)).toBe(false);
    for (const asset of activation.frozen.assets) {
      const content = await f.images.content(f.scope, asset.contentHash);
      if (!content) throw new Error('TEST_DRAFT_BYTES');
      expect(await f.contents.put(activation.campaignId, content)).toBe(asset.contentHash);
    }
    expect(await f.repository.publish(lease, { ...proof, fingerprint: 'changed' })).toBe(false);
    expect(await f.repository.publish(lease, proof)).toBe(true);
    expect(await new PostgresCampaignPublication(pool).state(activation.campaignId)).toBe(
      'PUBLISHED',
    );
    const snapshot = await f.ordinary.load(activation.campaignId);
    expect(snapshot?.state.bootstrap?.source.activationId).toBe(activation.activationId);
    const played = await f.ordinary.execute({
      campaignId: activation.campaignId,
      commandId: 'after-published-weather',
      actor: { actorId: f.scope.ownerId, kind: 'user' },
      command: {
        type: 'SetWeather',
        locationId: f.revision.identities.entities['dock'],
        weather: 'rain',
      },
    });
    expect(played.status).toBe('accepted');
    expect(await f.repository.publish(lease, proof)).toBe(true);
    expect(
      (await f.repository.ownedCampaign(f.scope.ownerId, activation.campaignId))?.activationId,
    ).toBe(activation.activationId);
    expect(
      (await f.repository.ownedActivation(f.scope.ownerId, activation.activationId))?.campaignId,
    ).toBe(activation.campaignId);
    expect(await f.repository.ownedCampaign(randomUUID(), activation.campaignId)).toBeNull();
    expect(await f.repository.owned(f.scope.ownerId, 1)).toHaveLength(1);
    expect(await f.repository.owned(randomUUID(), 10)).toEqual([]);
    const sealed = await new PostgresCampaignInitialContentStore(pool).get(activation.campaignId);
    expect(sealed?.scenario).toEqual(activation.frozen.revision);
    expect(sealed?.assets).toEqual(activation.frozen.assets);
  });
  it('keeps owner qualification, immutable source/content and truly lightweight polling after restart', async () => {
    const f = await activationPgFixture(pool),
      accepted = await claim(f),
      original = await f.repository.status(f.scope);
    expect(await f.repository.get({ ...f.scope, ownerId: randomUUID() })).toBeNull();
    expect(
      await f.repository.byRequest({ ...f.scope, ownerId: randomUUID() }, f.request.requestId),
    ).toBeNull();
    expect(
      await f.repository.claim({ ...accepted.scope, ownerId: randomUUID() }, randomUUID()),
    ).toBeNull();
    await f.content.prepare(accepted.activation);
    await f.content.prepare(accepted.activation);
    await expect(
      pool.query('UPDATE ltw_workshop_campaign_activations SET frozen=$1 WHERE activation_id=$2', [
        {},
        accepted.activation.activationId,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query('DELETE FROM ltw_campaign_initial_content WHERE campaign_id=$1', [
        accepted.activation.campaignId,
      ]),
    ).rejects.toThrow();
    await pool.query(
      'ALTER TABLE ltw_workshop_campaign_activations DISABLE TRIGGER ltw_campaign_activation_control',
    );
    await pool.query(
      "UPDATE ltw_workshop_campaign_activations SET frozen='{}'::jsonb WHERE activation_id=$1",
      [accepted.activation.activationId],
    );
    await pool.query(
      'ALTER TABLE ltw_workshop_campaign_activations ENABLE TRIGGER ltw_campaign_activation_control',
    );
    expect(await new PostgresCampaignActivationRepository(pool).status(f.scope)).toEqual(original);
    await expect(f.repository.get(f.scope)).rejects.toThrow(
      'CAMPAIGN_ACTIVATION_STORAGE_UNAVAILABLE',
    );
  });
});
