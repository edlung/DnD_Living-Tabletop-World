import {
  ASSET_PURPOSES,
  ASSET_VARIANTS,
  contentHashSchema,
  workshopIdSchema,
  type CampaignRevision,
  type DraftVisualEntry,
  type DraftVisualManifest,
} from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import { manifestDigest, newVisualManifest } from './manifest.ts';
import type { DraftImageScope } from './store.ts';

const entrySchema = z
  .object({
    entityId: workshopIdSchema,
    purpose: z.enum(ASSET_PURPOSES),
    variant: z.enum(ASSET_VARIANTS),
    label: z.string().nullable(),
    candidateId: workshopIdSchema,
    contentHash: contentHashSchema,
    mediaType: z.enum(['image/png', 'image/webp']),
    sourceRevision: z.number().int().positive(),
    sourceSignature: contentHashSchema,
    referenceHash: contentHashSchema.nullable(),
    state: z.enum(['CURRENT', 'STALE']),
    staleReason: z.enum(['SOURCE_CHANGED', 'REFERENCE_CHANGED', 'SUBJECT_REMOVED']).nullable(),
  })
  .strict();
type ManifestRow = {
  revision: number;
  version: number;
  package_digest: string;
  digest: string;
  entries: unknown;
  created_at: Date;
  request_fingerprint: string | null;
};
export function manifestView(row: ManifestRow): DraftVisualManifest {
  const value = {
    revision: row.revision,
    version: row.version,
    packageDigest: row.package_digest,
    entries: z.array(entrySchema).parse(row.entries),
  };
  if (manifestDigest(value) !== row.digest) throw new Error('CORRUPT_VISUAL_MANIFEST');
  return { ...value, digest: row.digest, createdAt: row.created_at.toISOString() };
}
export async function readManifest(
  client: pg.PoolClient,
  scope: DraftImageScope,
  revision: number,
): Promise<DraftVisualManifest | null> {
  const row = (
    await client.query<ManifestRow>(
      'SELECT revision,version,package_digest,digest,entries,created_at,request_fingerprint FROM ltw_workshop_visual_manifests WHERE owner_id=$1 AND draft_id=$2 AND revision=$3 ORDER BY version DESC LIMIT 1',
      [scope.ownerId, scope.draftId, revision],
    )
  ).rows[0];
  return row ? manifestView(row) : null;
}
export async function manifestNonce(
  client: pg.PoolClient,
  scope: DraftImageScope,
  requestId: string,
  fingerprint: string,
) {
  const row = (
    await client.query<ManifestRow>(
      'SELECT revision,version,package_digest,digest,entries,created_at,request_fingerprint FROM ltw_workshop_visual_manifests WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3',
      [scope.ownerId, scope.draftId, requestId],
    )
  ).rows[0];
  return row
    ? row.request_fingerprint === fingerprint
      ? { kind: 'saved' as const, manifest: manifestView(row) }
      : { kind: 'conflict' as const }
    : null;
}
export async function insertManifest(
  client: pg.PoolClient,
  scope: DraftImageScope,
  revision: CampaignRevision,
  version: number,
  entries: readonly DraftVisualEntry[],
  nonce: string | null = null,
  fingerprint: string | null = null,
) {
  const manifest = newVisualManifest(revision, version, entries, new Date().toISOString());
  const row = (
    await client.query<ManifestRow>(
      `INSERT INTO ltw_workshop_visual_manifests(owner_id,draft_id,revision,version,package_digest,digest,entries,request_id,request_fingerprint,created_at)
 VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,clock_timestamp()) RETURNING revision,version,package_digest,digest,entries,created_at,request_fingerprint`,
      [
        scope.ownerId,
        scope.draftId,
        revision.revision,
        version,
        revision.digest,
        manifest.digest,
        JSON.stringify(manifest.entries),
        nonce,
        fingerprint,
      ],
    )
  ).rows[0];
  if (!row) throw new Error('VISUAL_MANIFEST_NOT_STORED');
  return manifestView(row);
}
/** Historical missing manifests initialize empty, never from a parent's later selection. */
export async function ensureManifest(
  client: pg.PoolClient,
  scope: DraftImageScope,
  revision: CampaignRevision,
) {
  return (
    (await readManifest(client, scope, revision.revision)) ??
    (await insertManifest(client, scope, revision, 0, []))
  );
}
/** Called only for a new revision while the shared package append holds the owned draft lock. */
export async function appendInitialVisualManifestInTransaction(
  client: pg.PoolClient,
  scope: DraftImageScope,
  revision: CampaignRevision,
  parent: number,
) {
  const previous = parent === 0 ? null : await readManifest(client, scope, parent);
  return insertManifest(client, scope, revision, 0, previous?.entries ?? []);
}
