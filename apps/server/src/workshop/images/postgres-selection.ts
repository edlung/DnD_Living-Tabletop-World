import { selectDraftImageSchema, type DraftVisualEntry } from '@ltw/contracts';
import type pg from 'pg';

import { readCampaignRevisionInTransaction } from '../packages/postgres-store.ts';
import {
  draftImageSourceSignature,
  imageDigest,
  imageSlotKey,
  newVisualManifest,
} from './manifest.ts';
import { readDraftLocks } from '../revisions/postgres-helpers.ts';
import { draftLockConflicts } from '../revisions/policy.ts';
import { ensureManifest, insertManifest, manifestNonce } from './postgres-manifests.ts';
import { imageCandidate, imageDraftLock, imageSession } from './postgres-rows.ts';
import { selectedReference } from './requests.ts';
import type { DraftImageRepository, SelectDraftImage } from './store.ts';

export async function selectImage(
  client: pg.PoolClient,
  input: SelectDraftImage,
): ReturnType<DraftImageRepository['select']> {
  const { ownerId, draftId, authSessionId, ...body } = input;
  const parsed = selectDraftImageSchema.parse(body);
  const fingerprint = imageDigest(parsed);
  if (!(await imageDraftLock(client, input))) return { kind: 'not-found' };
  if (!(await imageSession(client, ownerId, authSessionId))) return { kind: 'conflict' };
  const old = await manifestNonce(client, input, input.requestId, fingerprint);
  if (old) return old;
  const revision = await readCampaignRevisionInTransaction(
    client,
    ownerId,
    draftId,
    input.revision,
  );
  if (!revision) return { kind: 'not-found' };
  const manifest = await ensureManifest(client, input, revision);
  if (revision.digest !== input.packageDigest || manifest.version !== input.expectedManifestVersion)
    return { kind: 'conflict' };
  const entries = manifest.entries.filter((entry) => imageSlotKey(entry) !== imageSlotKey(input));
  if (input.candidateId !== null) {
    const candidate = await imageCandidate(client, input, input.candidateId);
    if (!candidate || imageSlotKey(candidate) !== imageSlotKey(input)) return { kind: 'conflict' };
    const referenceHash =
      input.variant === 'reference'
        ? null
        : (selectedReference(manifest, input.entityId)?.contentHash ?? null);
    if (
      candidate.referenceHash !== referenceHash ||
      candidate.sourceSignature !== draftImageSourceSignature(revision, input, referenceHash)
    )
      return { kind: 'conflict' };
    const entry: DraftVisualEntry = {
      entityId: candidate.entityId,
      purpose: candidate.purpose,
      variant: candidate.variant,
      label: candidate.label,
      candidateId: candidate.candidateId,
      contentHash: candidate.contentHash,
      mediaType: candidate.mediaType,
      sourceRevision: candidate.sourceRevision,
      sourceSignature: candidate.sourceSignature,
      referenceHash: candidate.referenceHash,
      state: 'CURRENT',
      staleReason: null,
    };
    entries.push(entry);
  }
  const locks = await readDraftLocks(client, input);
  const imageLocks = locks
    ? { ...locks, entries: locks.entries.filter((entry) => entry.target.kind === 'image') }
    : null;
  const prospective = newVisualManifest(
    revision,
    manifest.version + 1,
    entries,
    new Date().toISOString(),
  );
  if (draftLockConflicts(imageLocks, revision, prospective).length) return { kind: 'conflict' };
  return {
    kind: 'saved',
    manifest: await insertManifest(
      client,
      input,
      revision,
      manifest.version + 1,
      entries,
      input.requestId,
      fingerprint,
    ),
  };
}
