import type {
  CampaignEditSpec,
  CampaignIdentities,
  CampaignPackage,
  CampaignRevision,
  CampaignRevisionReview,
  CampaignVisualChange,
  DraftLockSnapshot,
  DraftVisualManifest,
} from '@ltw/contracts';
import { campaignEditTargets, diffCampaignPackages, validateCampaignEditOutput } from '@ltw/domain';

import { imageDigest, imageSlotKey } from '../images/manifest.ts';
import { assessCampaignRevision } from '../packages/compiler.ts';
import { campaignContentDigest } from '../packages/content.ts';
import {
  allocateCampaignIdentities,
  canonicalOfOpaque,
  questStageKey,
  type CampaignIdentityRecord,
} from '../packages/identities.ts';
import { draftLockConflicts, prospectiveVisualManifest, revisionReviewDigest } from './policy.ts';

export interface BuildCampaignRevisionReview {
  readonly kind: 'EDIT' | 'RESTORE' | 'COMPARE';
  readonly sourceId: string;
  readonly candidateDigest: string;
  readonly head: CampaignRevision;
  readonly after: CampaignPackage;
  readonly locks: DraftLockSnapshot;
  readonly manifest: DraftVisualManifest;
  readonly ownerId: string;
  readonly editSpec?: CampaignEditSpec;
  readonly baseline?: CampaignRevision;
  readonly retainedIdentities?: readonly CampaignIdentityRecord[];
}

function retainedHeadIdentities(
  head: CampaignRevision,
  baseline?: CampaignRevision,
): readonly CampaignIdentityRecord[] {
  const records: CampaignIdentityRecord[] = [];
  const historical = baseline?.draftId === head.draftId ? baseline : undefined;
  const entities = { ...historical?.identities.entities, ...head.identities.entities };
  for (const [key, id] of Object.entries(entities)) {
    const entity =
      head.content.entities.find((item) => item.key === key) ??
      historical?.content.entities.find((item) => item.key === key);
    if (entity) records.push({ namespace: 'entities', key, id, entityKind: entity.kind });
  }
  for (const namespace of ['knowledge', 'clues', 'encounters'] as const)
    for (const [key, id] of Object.entries({
      ...historical?.identities[namespace],
      ...head.identities[namespace],
    }))
      records.push({ namespace, key, id, entityKind: null });
  records.push({ namespace: 'scene', key: 'initial', id: head.identities.scene, entityKind: null });
  for (const [key, id] of Object.entries({
    ...historical?.identities.quests,
    ...head.identities.quests,
  }))
    records.push({ namespace: 'quests', key, id: canonicalOfOpaque(id), entityKind: null });
  const stages = new Map<string, string>();
  for (const revision of [historical, head])
    for (const [quest, ids] of Object.entries(revision?.identities.stages ?? {}))
      for (const [stage, id] of Object.entries(ids)) stages.set(questStageKey(quest, stage), id);
  for (const [key, id] of stages)
    records.push({ namespace: 'quest-stages', key, id: canonicalOfOpaque(id), entityKind: null });
  return records;
}

function visualChanges(
  before: DraftVisualManifest,
  after: DraftVisualManifest,
): readonly CampaignVisualChange[] {
  const oldEntries = new Map(before.entries.map((entry) => [imageSlotKey(entry), entry]));
  const newEntries = new Map(after.entries.map((entry) => [imageSlotKey(entry), entry]));
  return [...new Set([...oldEntries.keys(), ...newEntries.keys()])].sort().flatMap((key) => {
    const old = oldEntries.get(key),
      next = newEntries.get(key);
    const slot = next ?? old;
    if (!slot || (old?.state === next?.state && old?.contentHash === next?.contentHash)) return [];
    return [
      {
        entityId: slot.entityId,
        purpose: slot.purpose,
        label: slot.label,
        beforeState: old?.state ?? 'MISSING',
        afterState: next?.state ?? 'MISSING',
        beforeHash: old?.contentHash ?? null,
        afterHash: next?.contentHash ?? null,
      },
    ];
  });
}

/** Owner-only read composition. Prospective IDs remain inside the isolated compiler assessment. */
export async function buildCampaignRevisionReview(
  input: BuildCampaignRevisionReview,
): Promise<CampaignRevisionReview> {
  const { head, after, locks, manifest, kind, baseline } = input;
  const issues: string[] = [];
  if (kind !== 'COMPARE' && head.revision >= 1_000_000) issues.push('REVISION_LIMIT');
  if (manifest.revision !== head.revision || manifest.packageDigest !== head.digest)
    issues.push('STALE_MANIFEST');
  if (kind === 'EDIT') {
    if (
      !baseline ||
      baseline.draftId !== head.draftId ||
      baseline.revision !== head.revision ||
      baseline.digest !== head.digest
    )
      issues.push('STALE_REVISION');
    if (input.candidateDigest !== imageDigest(after)) issues.push('CANDIDATE_DIGEST');
    if (input.editSpec && baseline) {
      const validation = validateCampaignEditOutput(baseline, after, input.editSpec);
      if (!validation.ok) issues.push(...validation.issues);
    }
  }
  const allocated = allocateCampaignIdentities(
    after,
    input.retainedIdentities ?? retainedHeadIdentities(head, baseline),
  );
  let identities: CampaignIdentities = head.identities;
  if (allocated.kind === 'allocated') identities = allocated.identities;
  else issues.push('IDENTITY_KIND_CHANGED');
  const prospective: CampaignRevision = {
    ...head,
    revision: head.revision + 1,
    basedOnRevision: head.revision,
    content: after,
    identities,
    digest: campaignContentDigest(after, identities),
  };
  const inherited = prospectiveVisualManifest(prospective, manifest);
  const conflicts = draftLockConflicts(locks, prospective, inherited);
  const assessment = await assessCampaignRevision(prospective, input.ownerId);
  const binding = {
    sourceId: input.sourceId,
    sourceDigest: input.candidateDigest,
    headDigest: head.digest,
    lockDigest: locks.digest,
    manifestDigest: manifest.digest,
  };
  const reviewDigest =
    kind === 'COMPARE'
      ? imageDigest({ kind: 'COMPARE', ...binding })
      : revisionReviewDigest({ kind: kind === 'EDIT' ? 'ADOPTION' : 'RESTORE', ...binding });
  return {
    kind,
    sourceId: input.sourceId,
    candidateDigest: input.candidateDigest,
    before: head,
    after,
    changes: diffCampaignPackages(head, after),
    visualChanges: visualChanges(manifest, inherited),
    assessment,
    conflicts,
    issues: [...new Set(issues)],
    locks,
    manifest,
    reviewDigest,
    adoptable:
      kind !== 'COMPARE' &&
      issues.length === 0 &&
      conflicts.length === 0 &&
      (kind === 'RESTORE' || assessment.readiness !== 'INVALID'),
    ...(input.editSpec ? { editSpec: input.editSpec } : {}),
    targets: campaignEditTargets(
      baseline ?? head,
      new Set(
        (input.editSpec?.lockSnapshot ?? locks).entries.flatMap((entry) =>
          entry.target.kind === 'content' ? [entry.target.targetId] : [],
        ),
      ),
    ),
  };
}
