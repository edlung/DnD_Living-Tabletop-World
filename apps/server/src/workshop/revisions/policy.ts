import type {
  CampaignRevision,
  DraftLockSnapshot,
  DraftLockTarget,
  DraftLockEntry,
  DraftLockConflict,
  DraftVisualManifest,
} from '@ltw/contracts';
import { resolveCampaignEditTarget } from '@ltw/domain';

import { imageDigest, imageSlotKey, newVisualManifest } from '../images/manifest.ts';
import { campaignRequestFingerprint } from '../packages/content.ts';
import type { AppendCampaignRevision } from '../packages/store.ts';

export const lockTargetKey = (target: DraftLockTarget): string =>
  target.kind === 'content' ? `content/${target.targetId}` : `image/${imageSlotKey(target)}`;

export function lockProjection(
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
  target: DraftLockTarget,
): { readonly label: string; readonly projection: unknown } | null {
  if (target.kind === 'content') return resolveCampaignEditTarget(revision, target.targetId);
  const selected = manifest.entries.find((entry) => imageSlotKey(entry) === imageSlotKey(target));
  if (!selected) return null;
  // Revision numbers describe provenance, not portable chosen-picture identity.
  const projection = {
    entityId: selected.entityId,
    purpose: selected.purpose,
    variant: selected.variant,
    label: selected.label,
    candidateId: selected.candidateId,
    contentHash: selected.contentHash,
    mediaType: selected.mediaType,
    sourceSignature: selected.sourceSignature,
    referenceHash: selected.referenceHash,
    state: selected.state,
    staleReason: selected.staleReason,
  };
  const name =
    revision.content.entities.find(
      (entity) => revision.identities.entities[entity.key] === target.entityId,
    )?.name ?? target.entityId;
  return { label: `${name} · ${target.purpose}`, projection };
}
export function captureDraftLocks(
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
  targets: readonly DraftLockTarget[],
): readonly DraftLockEntry[] | null {
  const unique = new Set<string>(),
    entries: DraftLockEntry[] = [];
  for (const target of targets) {
    const key = lockTargetKey(target);
    if (unique.has(key)) return null;
    unique.add(key);
    const value = lockProjection(revision, manifest, target);
    if (!value) return null;
    entries.push({ target, ...value, digest: imageDigest(value.projection) });
  }
  return entries.sort((a, b) => lockTargetKey(a.target).localeCompare(lockTargetKey(b.target)));
}
export function draftLockConflicts(
  locks: DraftLockSnapshot | null,
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
): readonly DraftLockConflict[] {
  return (locks?.entries ?? []).flatMap((entry) => {
    const current = lockProjection(revision, manifest, entry.target);
    return current && imageDigest(current.projection) === entry.digest
      ? []
      : [
          {
            target: entry.target,
            label: entry.label,
            reason: !current
              ? ('TARGET_MISSING' as const)
              : entry.target.kind === 'content'
                ? ('CONTENT_CHANGED' as const)
                : ('IMAGE_CHANGED' as const),
          },
        ];
  });
}
export function prospectiveVisualManifest(
  revision: CampaignRevision,
  parent: DraftVisualManifest | null,
) {
  return newVisualManifest(revision, 0, parent?.entries ?? [], revision.createdAt);
}
export function lockSnapshot(
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
  version: number,
  entries: readonly DraftLockEntry[],
  createdAt: string,
): DraftLockSnapshot {
  const value = {
    version,
    revision: revision.revision,
    packageDigest: revision.digest,
    manifestDigest: manifest.digest,
    entries,
  };
  return { ...value, digest: imageDigest(value), createdAt };
}
export function revisionWriteIntent(input: AppendCampaignRevision) {
  return {
    operation:
      input.writePolicy?.operation ?? (input.source.kind === 'AI' ? 'GENERATION' : 'MANUAL'),
    expectedLockVersion: input.expectedLockVersion ?? 0,
    expectedManifestVersion: input.expectedManifestVersion,
    expectedManifestDigest: input.expectedManifestDigest,
    intent: input.writePolicy?.intent ?? {},
    legacyFingerprint: campaignRequestFingerprint(input),
  };
}
export interface RevisionReviewIdentity {
  readonly kind: 'ADOPTION' | 'RESTORE';
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly headDigest: string;
  readonly lockDigest: string;
  readonly manifestDigest: string;
}
export const revisionReviewDigest = (value: RevisionReviewIdentity): string => imageDigest(value);
/** Authentication and ownership scope are trusted context, never replay identity. */
export const privateRevisionIntent = (input: object): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([name]) => !['ownerId', 'draftId', 'authSessionId'].includes(name),
    ),
  );
