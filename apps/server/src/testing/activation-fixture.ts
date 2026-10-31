import { randomUUID } from 'node:crypto';
import { InMemoryEventStore, WorldEngine, SequentialIds, SteppingClock } from '@ltw/domain';
import type pg from 'pg';
import type { CampaignActivationReview, StartCampaignActivation } from '@ltw/contracts';

import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { PostgresAssetContentStore } from '../assets/postgres-content-store.ts';
import { PostgresCampaignInitialContentStore } from '../campaigns/postgres-content.ts';
import { PostgresCampaignPublication } from '../campaigns/postgres-publication.ts';
import { PublishedEventStore } from '../campaigns/published-event-store.ts';
import { PostgresCampaignActivationRepository } from '../workshop/activation/postgres-store.ts';
import { loadCampaignActivationReview } from '../workshop/activation/review.ts';
import { activationSubmission } from '../workshop/activation/submission.ts';
import type {
  CampaignActivationRepository,
  StoredCampaignActivation,
} from '../workshop/activation/store.ts';
import { isolatedCampaignEngine } from '../workshop/packages/isolation.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import { createRawWorldEngine, createWorldEngine } from '../world-engine/runtime.ts';
import { MemoryCampaignActivationRepository } from './activation-store.ts';
import {
  MemoryCampaignInitialContentStore,
  MemoryCampaignPublication,
} from './campaign-content.ts';
import { editFixture } from './generation/edit-fixture.ts';
import { finishImage, imageRequestFor } from './draft-image-fixture.ts';
import { MemoryCampaignRevisionControlRepository } from './revision-controls.ts';
import { revisionControlFixture } from './revision-controls-postgres.ts';

const offlineImages = {
  availability: () =>
    Promise.resolve({
      available: false as const,
      provider: null,
      model: null,
      reason: 'NO_ROUTE' as const,
    }),
  prepare: () => Promise.resolve({ status: 'UNAVAILABLE' as const, reason: 'NO_ROUTE' }),
  forJob: () => Promise.resolve(null),
};
export function activationRequest(review: CampaignActivationReview): StartCampaignActivation {
  return {
    requestId: randomUUID(),
    revision: review.revision,
    packageDigest: review.packageDigest,
    planDigest: review.planDigest,
    manifestVersion: review.manifestVersion,
    manifestDigest: review.manifestDigest,
    expectedLockVersion: review.lockVersion,
    lockDigest: review.lockDigest,
    reviewDigest: review.reviewDigest,
    textOnly: review.textOnly,
    acknowledgedFindingIds: review.findings
      .filter((f) => f.severity === 'warning')
      .map((f) => f.findingId),
  };
}
async function reviewed(
  deps: WorkshopDependencies,
  ownerId: string,
  draftId: string,
  pictures: boolean,
) {
  const loaded = await loadCampaignActivationReview(
    deps,
    { ownerId, draftId },
    { textOnly: !pictures },
  );
  if (!loaded?.frozen)
    throw new Error(`TEST_ACTIVATION_NOT_READY:${JSON.stringify(loaded?.review.findings)}`);
  const { review, frozen } = loaded;
  return { frozen, review, request: activationRequest(review) };
}
export async function activationPgFixture(pool: pg.Pool, pictures = false) {
  const f = await revisionControlFixture(pool),
    repository = new PostgresCampaignActivationRepository(pool),
    content = new PostgresCampaignInitialContentStore(pool),
    contents = new PostgresAssetContentStore(pool),
    publication = new PostgresCampaignPublication(pool),
    bootstrap = createRawWorldEngine(pool),
    ordinary = createWorldEngine(pool, publication);
  if (pictures) {
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
  }
  const activation = {
    repository,
    initialContent: content,
    contents,
    draftImages: f.images,
    bootstrap,
  };
  const deps: WorkshopDependencies = {
    store: f.workshop,
    packages: f.revisions,
    images: { repository: f.images, runtime: offlineImages },
    revisionControls: f.controls,
    activation,
    clock: { now: Date.now },
    publicOrigin: 'https://table.example',
    limits: new RequestLimits(SIGN_IN_LIMITS, Date.now),
  };
  return {
    ...f,
    repository,
    content,
    contents,
    publication,
    bootstrap,
    ordinary,
    deps,
    ...(await reviewed(deps, f.scope.ownerId, f.scope.draftId, pictures)),
  };
}
export async function activationMemoryFixture() {
  const f = await editFixture();
  let now = f.now();
  const scope = { ownerId: f.ownerId, draftId: f.draftId };
  const controls = new MemoryCampaignRevisionControlRepository(
    f.workshop,
    f.revisions,
    f.images,
    [f.repository, f.edit],
    () => now,
  );
  const repository = new MemoryCampaignActivationRepository(
      f.workshop,
      f.revisions,
      f.images,
      controls,
      () => now,
    ),
    content = new MemoryCampaignInitialContentStore(repository),
    contents = new InMemoryAssetContentStore(),
    publication = new MemoryCampaignPublication(repository),
    rawStore = new InMemoryEventStore();
  const bootstrap = isolatedCampaignEngine(rawStore, new Date(now).toISOString(), 0x9100);
  // Reuse normal adapters while injecting the gated store, without exposing it to the bootstrap engine.
  const ordinary = new WorldEngine({
    store: new PublishedEventStore(rawStore, publication),
    ids: new SequentialIds(0x9200),
    clock: new SteppingClock(),
  });
  repository.configureProof({ engine: bootstrap, initialContent: content, contents });
  const activation = {
    repository,
    initialContent: content,
    contents,
    draftImages: f.images,
    bootstrap,
  };
  const deps: WorkshopDependencies = {
    store: f.workshop,
    packages: f.revisions,
    images: { repository: f.images, runtime: offlineImages },
    revisionControls: controls,
    activation,
    clock: { now: () => now },
    publicOrigin: 'https://table.example',
    limits: new RequestLimits(SIGN_IN_LIMITS, () => now),
  };
  return {
    ...f,
    scope,
    authSessionId: f.sessionId,
    revision: f.base,
    controls,
    repository,
    content,
    contents,
    publication,
    bootstrap,
    ordinary,
    rawStore,
    deps,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    ...(await reviewed(deps, f.ownerId, f.draftId, false)),
  };
}
export async function acceptedActivation(
  repository: CampaignActivationRepository,
  input: Parameters<CampaignActivationRepository['begin']>[0],
) {
  const result = await repository.begin(input);
  if (result.kind !== 'saved') throw new Error(`TEST_ACTIVATION_${result.kind}`);
  return result.activation;
}
export async function executeActivation(
  engine: ReturnType<typeof createRawWorldEngine>,
  activation: StoredCampaignActivation,
) {
  const result = await engine.execute(activationSubmission(activation));
  if (result.status === 'rejected') throw new Error(`TEST_BOOTSTRAP_${result.code}`);
  const command = (await engine.commandLog(activation.campaignId)).find(
    (c) => c.commandId === activation.bootstrapCommandId,
  );
  const snapshot = await engine.load(activation.campaignId);
  if (!command || !snapshot) throw new Error('TEST_BOOTSTRAP_MISSING');
  return { fingerprint: command.fingerprint, version: snapshot.state.version };
}
