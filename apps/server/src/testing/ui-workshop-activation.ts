import { randomUUID } from 'node:crypto';

import type { WorldEngine } from '@ltw/domain';

import type { AssetContentStore } from '../assets/content-store.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { loadCuratedSet } from '../images/curated-set.ts';
import { createLogger } from '../platform/logging/logger.ts';
import type { CampaignActivationDependencies } from '../workshop/activation/runtime.ts';
import { CampaignActivationWorker } from '../workshop/activation/worker.ts';
import { startCampaignActivationLoop } from '../workshop/activation/worker-loop.ts';
import { MemoryCampaignActivationRepository } from './activation-store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import {
  MemoryCampaignInitialContentStore,
  MemoryCampaignPublication,
} from './campaign-content.ts';
import { imageRequestFor } from './draft-image-fixture.ts';
import type { MemoryDraftImageRepository } from './draft-image-store.ts';
import type { MemoryCampaignRevisionControlRepository } from './revision-controls.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';
import { workshopOwnerId, workshopDraftId } from './ui-workshop-links.ts';

/** Actual activation worker and World Engine over isolated browser-test stores. No provider. */
export async function seedWorkshopActivation(input: {
  store: MemoryWorkshopStore;
  revisions: MemoryCampaignRevisionRepository;
  images: MemoryDraftImageRepository;
  controls: MemoryCampaignRevisionControlRepository;
  bootstrap: WorldEngine;
  contents: AssetContentStore;
  seed: string;
}) {
  const { store, revisions, images, controls, bootstrap, contents, seed } = input;
  const repository = new MemoryCampaignActivationRepository(store, revisions, images, controls);
  const content = new MemoryCampaignInitialContentStore(repository);
  const publication = new MemoryCampaignPublication(repository);
  let releasePending: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    releasePending = resolve;
  });
  const pendingDraftId = workshopDraftId(seed, 'activation-pending');
  const initialContent = {
    get: (campaignId: string) => content.get(campaignId),
    prepare: async (record: Parameters<typeof content.prepare>[0]) => {
      if (record.draftId === pendingDraftId) await pending;
      await content.prepare(record);
    },
  };
  repository.configureProof({ engine: bootstrap, initialContent, contents });
  const activation: CampaignActivationDependencies = {
    repository,
    initialContent,
    contents,
    draftImages: images,
    bootstrap,
  };
  const curated = await loadCuratedSet();
  const picture = curated.entries[0];
  if (!picture) throw new Error('ACTIVATION_FIXTURE_PICTURE_MISSING');
  for (const name of [
    'activation-pictures',
    'activation-text-only',
    'activation-layout',
    'activation-a11y',
  ] as const) {
    const scope = { ownerId: workshopOwnerId(seed, name), draftId: workshopDraftId(seed, name) };
    const revision = await revisions.latest(scope.ownerId, scope.draftId);
    if (!revision) throw new Error('ACTIVATION_FIXTURE_REVISION_MISSING');
    const token = newToken(),
      authSessionId = randomUUID(),
      at = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await store.issueInvitation({
      ownerId: scope.ownerId,
      invitationId: randomUUID(),
      tokenHash: hashToken(token),
      createdAt: at,
      expiresAt,
      authorizationSource: 'browser-test:stage-440-picture-preparation',
    });
    await store.redeem(
      hashToken(token),
      { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt: at, expiresAt },
      null,
    );
    const request = imageRequestFor(revision, scope, authSessionId);
    const made = await images.request(request);
    if (made.kind !== 'saved') throw new Error('ACTIVATION_FIXTURE_REQUEST');
    const claim = await images.claim({ ...scope, jobId: made.job.jobId }, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('ACTIVATION_FIXTURE_CLAIM');
    await images.beginDispatch(claim.lease, {
      chargeId: claim.lease.chargeId,
      requestDigest: request.requestDigest,
    });
    const completed = await images.complete(claim.lease, {
      bytes: curated.bytesOf(picture.file),
      mediaType: 'image/webp',
      model: request.model,
    });
    if (completed.kind !== 'stored') throw new Error('ACTIVATION_FIXTURE_COMPLETE');
    const selected = await images.select({
      ...scope,
      authSessionId,
      requestId: randomUUID(),
      revision: revision.revision,
      packageDigest: revision.digest,
      expectedManifestVersion: 0,
      entityId: completed.candidate.entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: completed.candidate.candidateId,
    });
    if (selected.kind !== 'saved') throw new Error('ACTIVATION_FIXTURE_SELECT');
  }
  const worker = new CampaignActivationWorker(activation);
  const stop = startCampaignActivationLoop(
    repository,
    worker,
    createLogger({ service: 'ui-activation-fixture', level: 'silent' }),
  );
  return {
    activation,
    publication,
    initialContent,
    releasePending,
    stop: async () => {
      releasePending();
      await stop();
    },
  };
}
