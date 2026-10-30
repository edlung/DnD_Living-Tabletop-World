import { createHash } from 'node:crypto';

import type {
  CampaignRevision,
  DraftImageSlot,
  DraftVisualEntry,
  DraftVisualManifest,
} from '@ltw/contracts';

import { campaignImageSourceProjection, CAMPAIGN_IMAGE_TEMPLATE_VERSION } from '@ltw/domain';
import { campaignCanonicalJson } from '../packages/content.ts';

export const DRAFT_IMAGE_TEMPLATE_VERSION = CAMPAIGN_IMAGE_TEMPLATE_VERSION;
export const imageDigest = (value: unknown): string =>
  `sha256:${createHash('sha256').update(campaignCanonicalJson(value)).digest('hex')}`;
export const imageSlotKey = (slot: DraftImageSlot): string =>
  `${slot.entityId}/${slot.purpose}/${slot.variant}/${slot.label ?? ''}`;
export function draftImageSourceSignature(
  revision: CampaignRevision,
  slot: DraftImageSlot,
  referenceHash: string | null,
): string | null {
  const projection = campaignImageSourceProjection(revision, slot, referenceHash);
  return projection === null ? null : imageDigest(projection);
}
/** Re-evaluate a frozen selection against this revision. This never reads a live parent later. */
export function inheritVisualEntries(
  revision: CampaignRevision,
  entries: readonly DraftVisualEntry[],
): readonly DraftVisualEntry[] {
  const evaluated = entries.map((entry) => {
    const exists = revision.content.entities.some(
      (entity) => revision.identities.entities[entity.key] === entry.entityId,
    );
    const signature = draftImageSourceSignature(revision, entry, entry.referenceHash);
    return {
      ...entry,
      state: signature === entry.sourceSignature ? ('CURRENT' as const) : ('STALE' as const),
      staleReason:
        signature === entry.sourceSignature
          ? null
          : exists
            ? ('SOURCE_CHANGED' as const)
            : ('SUBJECT_REMOVED' as const),
    };
  });
  return evaluated
    .map((entry) => {
      if (entry.variant === 'reference') return entry;
      const reference = evaluated.find(
        (item) =>
          item.entityId === entry.entityId &&
          item.purpose === 'image' &&
          item.variant === 'reference' &&
          item.state === 'CURRENT',
      );
      return reference?.contentHash === entry.referenceHash
        ? entry
        : { ...entry, state: 'STALE' as const, staleReason: 'REFERENCE_CHANGED' as const };
    })
    .sort((a, b) => imageSlotKey(a).localeCompare(imageSlotKey(b)));
}
export function manifestDigest(
  manifest: Pick<DraftVisualManifest, 'revision' | 'version' | 'packageDigest' | 'entries'>,
): string {
  return imageDigest({
    revision: manifest.revision,
    version: manifest.version,
    packageDigest: manifest.packageDigest,
    entries: manifest.entries,
  });
}
export function newVisualManifest(
  revision: CampaignRevision,
  version: number,
  entries: readonly DraftVisualEntry[],
  createdAt: string,
): DraftVisualManifest {
  const value = {
    revision: revision.revision,
    version,
    packageDigest: revision.digest,
    entries: inheritVisualEntries(revision, entries),
  };
  return { ...value, digest: manifestDigest(value), createdAt };
}
