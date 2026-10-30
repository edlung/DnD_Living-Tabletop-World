import { randomUUID } from 'node:crypto';

import { checkWorldIntegrity, replay } from '@ltw/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contentHashOf } from '../../assets/content-store.ts';
import {
  acceptedActivation,
  activationMemoryFixture,
  activationRequest,
} from '../../testing/activation-fixture.ts';
import { finishImage, imageRequestFor } from '../../testing/draft-image-fixture.ts';
import { loadCampaignActivationReview } from './review.ts';
import { CampaignActivationWorker } from './worker.ts';

const workers: CampaignActivationWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.shutdown()));
  vi.restoreAllMocks();
});
async function fixture(pictures = false) {
  const f = await activationMemoryFixture();
  if (pictures) {
    const made = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId),
      44,
    );
    const selected = await f.images.select({
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
    if (selected.kind !== 'saved') throw new Error('TEST_SELECTION');
  }
  const loaded = await loadCampaignActivationReview(f.deps, f.scope, { textOnly: !pictures });
  if (!loaded?.frozen) throw new Error('TEST_REVIEW');
  const activation = await acceptedActivation(f.repository, {
    ...f.scope,
    authSessionId: f.authSessionId,
    request: activationRequest(loaded.review),
    frozen: loaded.frozen,
  });
  const scope = { ...f.scope, activationId: activation.activationId };
  const worker = () => {
    const instance = new CampaignActivationWorker({
      repository: f.repository,
      bootstrap: f.bootstrap,
      initialContent: f.content,
      contents: f.contents,
      draftImages: f.images,
    });
    workers.push(instance);
    return instance;
  };
  return { ...f, activation, scope, worker };
}

describe('actual confirmed activation worker', () => {
  it('copies exact chosen bytes, seals definitions and publishes one complete bootstrap command', async () => {
    const f = await fixture(true),
      execute = vi.spyOn(f.bootstrap, 'execute');
    expect(await f.ordinary.load(f.activation.campaignId)).toBeNull();
    expect(await f.repository.owned(f.ownerId, 10)).toEqual([]);
    const worker = f.worker();
    await Promise.all([worker.run(f.scope), worker.run(f.scope)]);
    expect(await f.repository.status(f.scope)).toMatchObject({
      status: 'PUBLISHED',
      failureCode: null,
    });
    const snapshot = await f.ordinary.load(f.activation.campaignId);
    if (!snapshot) throw new Error('TEST_PUBLICATION');
    expect(snapshot.history[0]?.type).toBe('CampaignCreated');
    expect(snapshot.history.at(-1)?.type).toBe('CampaignBootstrapped');
    expect(
      snapshot.history.every(
        (event) =>
          event.causation.commandType === 'BootstrapCampaign' &&
          event.causation.actor.kind === 'user' &&
          event.causation.actor.actorId === f.ownerId,
      ),
    ).toBe(true);
    expect(snapshot.state.roster.size).toBe(0);
    expect(snapshot.state.assets.jobs.size).toBe(0);
    expect(snapshot.state.assets.requests.size).toBe(0);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    const asset = f.activation.frozen.assets[0];
    if (!asset) throw new Error('TEST_ASSET');
    const source = await f.images.content(f.scope, asset.contentHash),
      copied = await f.contents.get(f.activation.campaignId, asset.contentHash);
    expect(copied).toEqual(source);
    expect(copied && contentHashOf(copied.bytes)).toBe(asset.contentHash);
    expect(await f.content.get(f.activation.campaignId)).toMatchObject({
      scenarioDigest: f.activation.frozen.scenarioDigest,
      questDigest: f.activation.frozen.questDigest,
      assets: f.activation.frozen.assets,
    });
    expect(
      (await f.bootstrap.commandLog(f.activation.campaignId)).map(
        (command) => command.command.type,
      ),
    ).toEqual(['BootstrapCampaign']);
    const before = snapshot.history;
    await f.worker().run(f.scope);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await f.ordinary.load(f.activation.campaignId))?.history).toEqual(before);
  });

  it.each(['content', 'bootstrap', 'publication'] as const)(
    'recovers a committed %s whose acknowledgement was lost without creating another campaign',
    async (point) => {
      const f = await fixture(),
        actualExecute = f.bootstrap.execute.bind(f.bootstrap),
        execute = vi.spyOn(f.bootstrap, 'execute');
      if (point === 'content') {
        const prepare = f.content.prepare.bind(f.content);
        vi.spyOn(f.content, 'prepare').mockImplementationOnce(async (record) => {
          await prepare(record);
          throw new Error('TEST_LOST_CONTENT_ACK');
        });
      } else if (point === 'bootstrap') {
        execute.mockImplementationOnce(async (submission) => {
          await actualExecute(submission);
          throw new Error('TEST_LOST_BOOTSTRAP_ACK');
        });
      } else {
        const publish = f.repository.publish.bind(f.repository);
        vi.spyOn(f.repository, 'publish').mockImplementationOnce(async (lease, proof) => {
          expect(await publish(lease, proof)).toBe(true);
          throw new Error('TEST_LOST_PUBLICATION_ACK');
        });
      }
      const first = f.worker();
      await first.run(f.scope);
      await first.shutdown();
      if (point !== 'publication') {
        expect(await f.repository.status(f.scope)).toMatchObject({
          status: 'PROVISIONING',
          retryable: true,
          failureCode: 'ACTIVATION_UNAVAILABLE',
        });
        expect(await f.ordinary.load(f.activation.campaignId)).toBeNull();
      }
      if (point === 'bootstrap') {
        expect(await f.bootstrap.load(f.activation.campaignId)).not.toBeNull();
        await f.workshop.revokeOwner(
          f.ownerId,
          new Date(f.now()).toISOString(),
          'test:440-durable-consent',
        );
      }
      f.advance(5001);
      await f.worker().run(f.scope);
      expect(await f.repository.status(f.scope)).toMatchObject({ status: 'PUBLISHED' });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(await f.bootstrap.commandLog(f.activation.campaignId)).toHaveLength(1);
      expect(await f.repository.owned(f.ownerId, 10)).toHaveLength(1);
    },
  );

  it('fences a lease that expires during content work and lets a new worker finish the same immutable intent', async () => {
    const f = await fixture(),
      prepare = f.content.prepare.bind(f.content),
      execute = vi.spyOn(f.bootstrap, 'execute');
    vi.spyOn(f.content, 'prepare').mockImplementationOnce(async (record) => {
      await prepare(record);
      f.advance(30001);
    });
    await f.worker().run(f.scope);
    expect(execute).not.toHaveBeenCalled();
    expect(await f.ordinary.load(f.activation.campaignId)).toBeNull();
    await f.worker().run(f.scope);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await f.repository.status(f.scope)).toMatchObject({ status: 'PUBLISHED' });
  });

  it('refuses changed source bytes before bootstrapping and does not automatically retry an integrity failure', async () => {
    const f = await fixture(true),
      execute = vi.spyOn(f.bootstrap, 'execute');
    vi.spyOn(f.images, 'content').mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    });
    await f.worker().run(f.scope);
    expect(await f.repository.status(f.scope)).toMatchObject({
      status: 'PROVISIONING',
      retryable: false,
      failureCode: 'ACTIVATION_BYTE_MISMATCH',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(await f.ordinary.load(f.activation.campaignId)).toBeNull();
    f.advance(60000);
    await f.worker().run(f.scope);
    expect(execute).not.toHaveBeenCalled();
    expect(await f.repository.pending(10)).toEqual([]);
  });
});
