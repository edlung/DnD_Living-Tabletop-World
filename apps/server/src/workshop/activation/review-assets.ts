import {
  bootstrapCampaignAssetSchema,
  type CampaignBootstrapAsset,
  type CampaignFinding,
  type CampaignRevision,
  type DraftVisualManifest,
  type CampaignActivationReview,
} from '@ltw/contracts';

import { inheritVisualEntries, imageSlotKey } from '../images/manifest.ts';
import type { DraftImageRepository } from '../images/store.ts';
import { draftImageSubjects } from '../images/views.ts';
import type { ActivationScope } from './store.ts';

/** Owner read composition uses immutable candidate metadata; the worker verifies actual bytes. */
export async function activationPictures(
  scope: ActivationScope,
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
  repository: DraftImageRepository,
  textOnly: boolean,
): Promise<{
  readonly assets: readonly CampaignBootstrapAsset[];
  readonly visuals: CampaignActivationReview['visuals'];
  readonly findings: readonly CampaignFinding[];
}> {
  const entries = inheritVisualEntries(revision, manifest.entries);
  const current = entries.filter((entry) => entry.state === 'CURRENT');
  const selectedSlots = new Set(entries.map(imageSlotKey));
  const expected = draftImageSubjects(revision, manifest).flatMap((subject) =>
    subject.allowedPurposes.map((purpose) =>
      imageSlotKey({
        entityId: subject.entityId,
        purpose,
        variant: purpose === 'image' ? 'reference' : 'derived',
        label: purpose === 'image' ? null : purpose,
      }),
    ),
  );
  const missing = expected.filter((slot) => !selectedSlots.has(slot)).length;
  const findings: CampaignFinding[] = [];
  const add = (severity: 'error' | 'warning', code: string, message: string) => {
    findings.push({ severity, code, path: 'visuals', message });
  };
  if (!textOnly && !current.length)
    add(
      'error',
      'ACTIVATION_NO_CURRENT_PICTURES',
      'Choose a current picture or explicitly activate a text-only campaign.',
    );
  if (!textOnly && entries.length !== current.length)
    add(
      'error',
      'ACTIVATION_STALE_PICTURES',
      'Replace or remove stale chosen pictures, or explicitly activate without pictures.',
    );
  if (!textOnly && missing > 0)
    add(
      'warning',
      'ACTIVATION_MISSING_PICTURES',
      'Objects without a chosen picture will use the neutral fallback.',
    );
  if (textOnly && entries.length > 0)
    add(
      'warning',
      'ACTIVATION_TEXT_ONLY',
      'This text-only campaign will copy none of the chosen draft pictures.',
    );
  const assets: CampaignBootstrapAsset[] = [];
  let invalidSource = false;
  if (!textOnly)
    for (const entry of current) {
      const candidate = await repository.candidate(scope, entry.candidateId);
      if (
        !candidate ||
        imageSlotKey(candidate) !== imageSlotKey(entry) ||
        candidate.contentHash !== entry.contentHash ||
        candidate.mediaType !== entry.mediaType ||
        candidate.sourceSignature !== entry.sourceSignature ||
        candidate.referenceHash !== entry.referenceHash ||
        candidate.sourceRevision !== entry.sourceRevision
      ) {
        invalidSource = true;
        continue;
      }
      const parsed = bootstrapCampaignAssetSchema.safeParse({
        entityId: entry.entityId,
        purpose: entry.purpose,
        variant: entry.variant,
        label: entry.label,
        audience: 'players',
        contentHash: entry.contentHash,
        mediaType: entry.mediaType,
        generator: { provider: candidate.provider, model: candidate.model },
        origin: {
          draftId: scope.draftId,
          revision: candidate.sourceRevision,
          candidateId: candidate.candidateId,
          jobId: candidate.jobId,
          sourceSignature: candidate.sourceSignature,
          referenceHash: candidate.referenceHash,
          manifestDigest: manifest.digest,
        },
      });
      if (parsed.success) assets.push(parsed.data);
      else invalidSource = true;
    }
  if (invalidSource)
    add(
      'error',
      'ACTIVATION_PICTURE_SOURCE',
      'One chosen picture cannot be verified for canonical adoption. Review its source or choose text-only activation.',
    );
  const names = new Map(
    revision.content.entities.map((entity) => [
      revision.identities.entities[entity.key],
      entity.name,
    ]),
  );
  return {
    assets,
    findings,
    visuals: {
      selected: entries.length,
      current: current.length,
      stale: entries.length - current.length,
      missing,
      adopted: textOnly ? 0 : assets.length,
      requiresTextOnly: current.length === 0,
      entries: entries.map((entry) => ({
        entityId: entry.entityId,
        name: names.get(entry.entityId) ?? 'An earlier object',
        purpose: entry.purpose,
        label: entry.label,
        contentHash: entry.contentHash,
        state: entry.state,
      })),
    },
  };
}
