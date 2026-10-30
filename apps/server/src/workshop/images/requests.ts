import {
  contentHashSchema,
  workshopIdSchema,
  type CampaignRevision,
  type DraftVisualManifest,
} from '@ltw/contracts';
import { z } from 'zod';

import { draftImageInputSchema, resolveDraftImageVisual } from '../../images/draft-input.ts';
import { draftImageSourceSignature, imageDigest } from './manifest.ts';
import type { RequestDraftImage } from './store.ts';

export function checkedImageRequest(input: RequestDraftImage): RequestDraftImage {
  return z
    .object({
      ownerId: workshopIdSchema,
      draftId: workshopIdSchema,
      requestId: workshopIdSchema,
      authSessionId: workshopIdSchema,
      revision: z.number().int().min(1).max(1000000),
      packageDigest: contentHashSchema,
      expectedManifestVersion: z.number().int().min(0).max(1000000),
      input: draftImageInputSchema,
      sourceSignature: contentHashSchema,
      provider: z.string().min(1).max(100),
      model: z.string().min(1).max(200),
      requestDigest: contentHashSchema,
    })
    .strict()
    .parse(input);
}
/** Fingerprint owner intent, not route configuration recalculated after an accepted request. */
export function imageRequestFingerprint(request: RequestDraftImage): string {
  const { revision, packageDigest, expectedManifestVersion, input } = request;
  return imageDigest({
    revision,
    packageDigest,
    expectedManifestVersion,
    entityId: input.subject.entityId,
    purpose: input.purpose,
    variant: input.variant,
    label: input.label,
    note: input.note,
  });
}
export const selectedReference = (manifest: DraftVisualManifest, entityId: string) =>
  manifest.entries.find(
    (entry) =>
      entry.entityId === entityId &&
      entry.purpose === 'image' &&
      entry.variant === 'reference' &&
      entry.state === 'CURRENT',
  );
export function preparedImageMatches(
  request: RequestDraftImage,
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
): boolean {
  const input = request.input;
  const entity = revision.content.entities.find(
    (item) => revision.identities.entities[item.key] === input.subject.entityId,
  );
  if (!entity || entity.key !== input.subject.localKey || entity.kind !== input.subject.kind)
    return false;
  const visual = resolveDraftImageVisual(revision.content, entity.key, input.purpose);
  if (!visual || visual.description !== input.appearance || visual.style !== input.style)
    return false;
  if (input.purpose !== 'image') {
    const reference = selectedReference(manifest, input.subject.entityId);
    if (
      !reference ||
      input.reference?.candidateId !== reference.candidateId ||
      input.reference.contentHash !== reference.contentHash ||
      input.reference.mediaType !== reference.mediaType
    )
      return false;
  }
  return (
    request.sourceSignature ===
    draftImageSourceSignature(
      revision,
      {
        entityId: input.subject.entityId,
        purpose: input.purpose,
        variant: input.variant,
        label: input.label,
      },
      input.reference?.contentHash ?? null,
    )
  );
}
