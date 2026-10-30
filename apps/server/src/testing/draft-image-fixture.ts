import { randomUUID } from 'node:crypto';

import type { AssetPurpose, CampaignRevision } from '@ltw/contracts';

import { resolveDraftImageVisual, type DraftImageInput } from '../images/draft-input.ts';
import { draftImageSourceSignature, imageDigest } from '../workshop/images/manifest.ts';
import type {
  DraftImageRepository,
  DraftImageScope,
  DraftImageLease,
  RequestDraftImage,
} from '../workshop/images/store.ts';
import { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { MemoryDraftImageRepository } from './draft-image-store.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';
import { hashToken, newToken } from '../auth/tokens.ts';

/** Small valid PNG; test variants add an ignored trailing marker to distinguish exact bytes. */
export const TEST_DRAFT_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=',
    'base64',
  ),
);
export function imageRequestFor(
  revision: CampaignRevision,
  scope: DraftImageScope,
  authSessionId: string,
  manifestVersion = 0,
  entityKey = 'iva',
  purpose: AssetPurpose = 'image',
  reference: DraftImageInput['reference'] = null,
): RequestDraftImage {
  const entity = revision.content.entities.find((item) => item.key === entityKey);
  const entityId = revision.identities.entities[entityKey];
  const visual = resolveDraftImageVisual(revision.content, entityKey, purpose);
  if (!entity || !entityId || !visual) throw new Error('TEST_VISUAL_MISSING');
  const input: DraftImageInput = {
    schemaVersion: 1,
    subject: { entityId, localKey: entityKey, kind: entity.kind },
    appearance: visual.description,
    style: visual.style,
    note: null,
    purpose,
    variant: purpose === 'image' ? 'reference' : 'derived',
    label: purpose === 'image' ? null : purpose,
    reference,
    stylePolicy: { version: 1, referenceHashes: [] },
  };
  const sourceSignature = draftImageSourceSignature(
    revision,
    { entityId, purpose, variant: input.variant, label: input.label },
    reference?.contentHash ?? null,
  );
  if (!sourceSignature) throw new Error('TEST_SOURCE_SIGNATURE_MISSING');
  return {
    ...scope,
    authSessionId,
    requestId: randomUUID(),
    revision: revision.revision,
    packageDigest: revision.digest,
    expectedManifestVersion: manifestVersion,
    input,
    sourceSignature,
    provider: 'test-image',
    model: 'offline-png',
    requestDigest: imageDigest(input),
  };
}
export async function finishImage(
  repository: DraftImageRepository,
  request: RequestDraftImage,
  marker = 0,
) {
  const created = await repository.request(request);
  if (created.kind !== 'saved') throw new Error(`TEST_IMAGE_REQUEST_${created.kind}`);
  const scope = { ownerId: request.ownerId, draftId: request.draftId, jobId: created.job.jobId };
  const claimed = await repository.claim(scope, randomUUID());
  if (claimed.kind !== 'claimed') throw new Error('TEST_IMAGE_CLAIM');
  const lease: DraftImageLease = claimed.lease;
  const gate = await repository.beginDispatch(lease, {
    chargeId: lease.chargeId,
    requestDigest: request.requestDigest,
  });
  if (gate !== 'DISPATCH') throw new Error('TEST_IMAGE_GATE');
  const bytes = marker ? new Uint8Array([...TEST_DRAFT_PNG, marker]) : TEST_DRAFT_PNG;
  const result = await repository.complete(lease, {
    bytes,
    mediaType: 'image/png',
    model: request.model,
  });
  if (result.kind !== 'stored') throw new Error('TEST_IMAGE_COMPLETE');
  return { scope, lease, candidate: result.candidate, bytes };
}
export async function memoryImageFixture() {
  let now = Date.now();
  const workshop = new MemoryWorkshopStore();
  const revisions = new MemoryCampaignRevisionRepository(workshop);
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    authSessionId = randomUUID(),
    token = newToken();
  const at = new Date(now).toISOString(),
    expiresAt = new Date(now + 86400000).toISOString();
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash: hashToken(token),
    createdAt: at,
    expiresAt,
    authorizationSource: 'test:420-images',
  });
  await workshop.redeem(
    hashToken(token),
    { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt: at, expiresAt },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'en' },
    draftId,
    at,
  );
  const images = new MemoryDraftImageRepository(workshop, revisions, () => now);
  const saved = await revisions.append({
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: englishBellCampaign(),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: at,
  });
  if (saved.kind !== 'saved') throw new Error('TEST_REVISION_FAILED');
  const scope = { ownerId, draftId };
  return {
    workshop,
    revisions,
    images,
    scope,
    authSessionId,
    revision: saved.revision,
    request: () => imageRequestFor(saved.revision, scope, authSessionId),
    advance: (ms: number) => {
      now += ms;
    },
    now: () => new Date(now).toISOString(),
  };
}
