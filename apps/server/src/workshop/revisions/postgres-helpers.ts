import type { CampaignRevision, DraftLockSnapshot, DraftLockEntry } from '@ltw/contracts';
import { draftLockTargetSchema } from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import { imageDigest } from '../images/manifest.ts';
import { ensureManifest } from '../images/postgres-manifests.ts';
import { readCampaignRevisionInTransaction } from '../packages/postgres-store.ts';
import { lockSnapshot, revisionWriteIntent } from './policy.ts';
import type { AppendCampaignRevision } from '../packages/store.ts';
import type { RevisionControlScope } from './store.ts';

type LockRow = {
  version: number;
  revision: number;
  package_digest: string;
  manifest_digest: string;
  entries: unknown;
  digest: string;
  created_at: Date;
  request_fingerprint: string | null;
};
const entrySchema = z
  .object({
    target: draftLockTargetSchema,
    label: z.string(),
    projection: z.unknown(),
    digest: z.string(),
  })
  .strict();
function view(row: LockRow): DraftLockSnapshot {
  const value = {
    version: row.version,
    revision: row.revision,
    packageDigest: row.package_digest,
    manifestDigest: row.manifest_digest,
    entries: z.array(entrySchema).parse(row.entries),
  };
  if (
    imageDigest(value) !== row.digest ||
    value.entries.some((e) => imageDigest(e.projection) !== e.digest)
  )
    throw new Error('CORRUPT_DRAFT_LOCKS');
  return { ...value, digest: row.digest, createdAt: row.created_at.toISOString() };
}
export async function controlDraftLock(client: pg.PoolClient, scope: RevisionControlScope) {
  return (
    (
      await client.query(
        'SELECT draft_id FROM ltw_workshop_drafts WHERE owner_id=$1 AND draft_id=$2 FOR UPDATE',
        [scope.ownerId, scope.draftId],
      )
    ).rowCount === 1
  );
}
export async function currentControlSession(
  client: pg.PoolClient,
  ownerId: string,
  sessionId: string,
) {
  return (
    (
      await client.query(
        `SELECT session_id FROM ltw_workshop_sessions
    WHERE owner_id=$1 AND session_id=$2 AND revoked_at IS NULL AND created_at<=clock_timestamp()
    AND expires_at>clock_timestamp() FOR SHARE`,
        [ownerId, sessionId],
      )
    ).rowCount === 1
  );
}
export async function controlHead(client: pg.PoolClient, scope: RevisionControlScope) {
  const row = (
    await client.query<{ revision: number }>(
      `SELECT revision FROM ltw_campaign_package_revisions
    WHERE owner_id=$1 AND draft_id=$2 ORDER BY revision DESC LIMIT 1`,
      [scope.ownerId, scope.draftId],
    )
  ).rows[0];
  return row
    ? readCampaignRevisionInTransaction(client, scope.ownerId, scope.draftId, row.revision)
    : null;
}
export async function readDraftLocks(client: pg.PoolClient, scope: RevisionControlScope) {
  const row = (
    await client.query<LockRow>(
      `SELECT * FROM ltw_campaign_draft_lock_versions
    WHERE owner_id=$1 AND draft_id=$2 ORDER BY version DESC LIMIT 1`,
      [scope.ownerId, scope.draftId],
    )
  ).rows[0];
  return row ? view(row) : null;
}
export async function insertDraftLocks(
  client: pg.PoolClient,
  scope: RevisionControlScope,
  revision: CampaignRevision,
  version: number,
  entries: readonly DraftLockEntry[],
  requestId: string | null = null,
  fingerprint: string | null = null,
) {
  const manifest = await ensureManifest(client, scope, revision);
  const locks = lockSnapshot(revision, manifest, version, entries, new Date().toISOString());
  const row = (
    await client.query<LockRow>(
      `INSERT INTO ltw_campaign_draft_lock_versions
    (owner_id,draft_id,version,revision,package_digest,manifest_digest,entries,digest,request_id,request_fingerprint,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,clock_timestamp()) RETURNING *`,
      [
        scope.ownerId,
        scope.draftId,
        version,
        revision.revision,
        revision.digest,
        manifest.digest,
        JSON.stringify(entries),
        locks.digest,
        requestId,
        fingerprint,
      ],
    )
  ).rows[0];
  if (!row) throw new Error('DRAFT_LOCKS_NOT_STORED');
  return view(row);
}
export async function ensureDraftLocks(
  client: pg.PoolClient,
  scope: RevisionControlScope,
  revision: CampaignRevision,
) {
  return (await readDraftLocks(client, scope)) ?? insertDraftLocks(client, scope, revision, 0, []);
}
export async function lockNonce(
  client: pg.PoolClient,
  scope: RevisionControlScope,
  requestId: string,
  fingerprint: string,
) {
  const row = (
    await client.query<LockRow>(
      `SELECT * FROM ltw_campaign_draft_lock_versions
    WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3`,
      [scope.ownerId, scope.draftId, requestId],
    )
  ).rows[0];
  return row
    ? row.request_fingerprint === fingerprint
      ? { kind: 'saved' as const, locks: view(row) }
      : { kind: 'conflict' as const, reason: 'REQUEST_REUSED' as const }
    : null;
}
export async function writeReceipt(
  client: pg.PoolClient,
  input: AppendCampaignRevision,
  revision: number,
) {
  const intent = revisionWriteIntent(input);
  await client.query(
    `INSERT INTO ltw_campaign_revision_write_receipts
    (owner_id,draft_id,request_id,operation,intent,request_fingerprint,revision,created_at)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,clock_timestamp())`,
    [
      input.ownerId,
      input.draftId,
      input.requestId,
      intent.operation,
      JSON.stringify(intent),
      imageDigest(intent),
      revision,
    ],
  );
}
export async function readWriteReceipt(
  client: pg.PoolClient,
  scope: RevisionControlScope,
  requestId: string,
) {
  const row =
    (
      await client.query<{ intent: unknown; request_fingerprint: string; revision: number }>(
        `SELECT intent,request_fingerprint,revision FROM ltw_campaign_revision_write_receipts
    WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3`,
        [scope.ownerId, scope.draftId, requestId],
      )
    ).rows[0] ?? null;
  if (row && imageDigest(row.intent) !== row.request_fingerprint)
    throw new Error('CORRUPT_REVISION_RECEIPT');
  return row;
}
