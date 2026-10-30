import type {
  CampaignIdentities,
  CampaignRevision,
  CampaignRevisionSummary,
  CampaignPackage,
} from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import { campaignKeySchema, workshopIdSchema } from '@ltw/contracts';
import {
  allocateCampaignIdentities,
  type CampaignIdentityRecord,
  type CampaignIdentityNamespace,
} from './identities.ts';
import {
  campaignContentDigest,
  campaignRequestFingerprint,
  normalizeCampaignAppend,
  parseStoredCampaignContent,
  parseStoredCampaignSource,
} from './content.ts';
import type {
  AppendCampaignRevision,
  AppendCampaignRevisionResult,
  CampaignRevisionRepository,
} from './store.ts';
import { appendInitialVisualManifestInTransaction } from '../images/postgres-manifests.ts';
import { readManifest } from '../images/postgres-manifests.ts';
import { readDraftLocks, readWriteReceipt, writeReceipt } from '../revisions/postgres-helpers.ts';
import {
  draftLockConflicts,
  prospectiveVisualManifest,
  revisionWriteIntent,
} from '../revisions/policy.ts';
import { imageDigest } from '../images/manifest.ts';

type RevisionRow = {
  draft_id: string;
  owner_id: string;
  revision: number;
  based_on_revision: number;
  request_fingerprint: string;
  content: unknown;
  identities: unknown;
  digest: string;
  source: unknown;
  created_at: Date;
};
const COLUMNS =
  'draft_id, owner_id, revision, based_on_revision, request_fingerprint, content, identities, digest, source, created_at';
const identityMap = z.record(campaignKeySchema, workshopIdSchema);
const identitiesSchema = z
  .object({
    entities: identityMap,
    knowledge: identityMap,
    clues: identityMap,
    encounters: identityMap,
    scene: workshopIdSchema,
  })
  .strict();
function revisionView(row: RevisionRow): CampaignRevision {
  const content = parseStoredCampaignContent(row.content);
  const identities: CampaignIdentities = identitiesSchema.parse(row.identities);
  const source = parseStoredCampaignSource(row.source);
  if (
    campaignContentDigest(content, identities) !== row.digest ||
    (source.kind === 'OWNER' && source.actorId !== row.owner_id)
  )
    throw new Error('CORRUPT_CAMPAIGN_REVISION');
  return {
    draftId: row.draft_id,
    revision: row.revision,
    basedOnRevision: row.based_on_revision,
    content,
    identities,
    digest: row.digest,
    source,
    createdAt: row.created_at.toISOString(),
  };
}

export async function readCampaignRevisionInTransaction(
  client: pg.PoolClient,
  ownerId: string,
  draftId: string,
  revision: number,
): Promise<CampaignRevision | null> {
  const row = (
    await client.query<RevisionRow>(
      `SELECT ${COLUMNS} FROM ltw_campaign_package_revisions WHERE owner_id=$1 AND draft_id=$2 AND revision=$3`,
      [ownerId, draftId, revision],
    )
  ).rows[0];
  return row ? revisionView(row) : null;
}

/** Bounded by the candidate key sets; retained history outside this proposal is not loaded. */
async function readIdentityRecords(
  client: pg.PoolClient,
  ownerId: string,
  draftId: string,
  content: CampaignPackage,
): Promise<readonly CampaignIdentityRecord[]> {
  const rows = (
    await client.query<{
      namespace: CampaignIdentityNamespace;
      local_key: string;
      canonical_id: string;
      entity_kind: CampaignIdentityRecord['entityKind'];
    }>(
      `SELECT namespace,local_key,canonical_id,entity_kind
    FROM ltw_campaign_package_identities WHERE owner_id=$1 AND draft_id=$2 AND (
      (namespace='entities' AND local_key=ANY($3::text[])) OR
      (namespace='knowledge' AND local_key=ANY($4::text[])) OR
      (namespace='clues' AND local_key=ANY($5::text[])) OR
      (namespace='encounters' AND local_key=ANY($6::text[])) OR
      (namespace='scene' AND local_key='initial')) ORDER BY namespace,local_key`,
      [
        ownerId,
        draftId,
        content.entities.map((e) => e.key),
        content.knowledge.map((e) => e.key),
        content.clues.map((e) => e.key),
        content.encounters.map((e) => e.key),
      ],
    )
  ).rows;
  return rows.map((row) => ({
    namespace: row.namespace,
    key: row.local_key,
    id: row.canonical_id,
    entityKind: row.entity_kind,
  }));
}

/** Caller owns the transaction; locks the owned draft and preserves nonce/CAS/identity semantics. */
export async function appendCampaignRevisionInTransaction(
  client: pg.PoolClient,
  raw: AppendCampaignRevision,
): Promise<AppendCampaignRevisionResult> {
  const input = normalizeCampaignAppend(raw);
  const owned = await client.query(
    'SELECT draft_id FROM ltw_workshop_drafts WHERE draft_id = $1 AND owner_id = $2 FOR UPDATE',
    [input.draftId, input.ownerId],
  );
  if (owned.rowCount !== 1) return { kind: 'not-found' };
  const fingerprint = campaignRequestFingerprint(input);
  const previous = (
    await client.query<RevisionRow>(
      `SELECT ${COLUMNS} FROM ltw_campaign_package_revisions
    WHERE draft_id = $1 AND owner_id = $2 AND request_id = $3`,
      [input.draftId, input.ownerId, input.requestId],
    )
  ).rows[0];
  if (previous) {
    const receipt = await readWriteReceipt(client, input, input.requestId);
    const policyMatches = receipt
      ? receipt.request_fingerprint === imageDigest(revisionWriteIntent(input))
      : (input.expectedLockVersion ?? 0) === 0 && input.writePolicy === undefined;
    return previous.request_fingerprint === fingerprint && policyMatches
      ? { kind: 'saved', revision: revisionView(previous) }
      : { kind: 'conflict', reason: 'REQUEST_REUSED' };
  }
  const latest =
    (
      await client.query<{ revision: number }>(
        'SELECT revision FROM ltw_campaign_package_revisions WHERE draft_id = $1 AND owner_id = $2 ORDER BY revision DESC LIMIT 1',
        [input.draftId, input.ownerId],
      )
    ).rows[0]?.revision ?? 0;
  if (latest !== input.basedOnRevision) return { kind: 'conflict', reason: 'STALE_REVISION' };
  const locks = await readDraftLocks(client, input);
  if ((locks?.version ?? 0) !== (input.expectedLockVersion ?? 0))
    return { kind: 'conflict', reason: 'STALE_LOCKS' };
  const registry = await readIdentityRecords(client, input.ownerId, input.draftId, input.content);
  const allocation = allocateCampaignIdentities(input.content, registry);
  if (allocation.kind === 'conflict') return { kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' };
  const prospective: CampaignRevision = {
    draftId: input.draftId,
    revision: latest + 1,
    basedOnRevision: latest,
    content: input.content,
    identities: allocation.identities,
    digest: campaignContentDigest(input.content, allocation.identities),
    source: input.source,
    createdAt: input.createdAt,
  };
  const parent = latest === 0 ? null : await readManifest(client, input, latest);
  if (
    input.expectedManifestVersion !== undefined &&
    (parent?.version !== input.expectedManifestVersion ||
      parent.digest !== input.expectedManifestDigest)
  )
    return { kind: 'conflict', reason: 'STALE_MANIFEST' };
  if (draftLockConflicts(locks, prospective, prospectiveVisualManifest(prospective, parent)).length)
    return { kind: 'conflict', reason: 'LOCKED_CONTENT' };
  for (const record of allocation.added)
    await client.query(
      `INSERT INTO ltw_campaign_package_identities
    (draft_id, owner_id, namespace, local_key, canonical_id, entity_kind) VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.draftId, input.ownerId, record.namespace, record.key, record.id, record.entityKind],
    );
  const digest = campaignContentDigest(input.content, allocation.identities);
  const inserted = await client.query<RevisionRow>(
    `INSERT INTO ltw_campaign_package_revisions
    (draft_id, owner_id, revision, based_on_revision, request_id, request_fingerprint, content, identities, digest, source, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11) RETURNING ${COLUMNS}`,
    [
      input.draftId,
      input.ownerId,
      latest + 1,
      input.basedOnRevision,
      input.requestId,
      fingerprint,
      JSON.stringify(input.content),
      JSON.stringify(allocation.identities),
      digest,
      JSON.stringify(input.source),
      input.createdAt,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('CAMPAIGN_REVISION_NOT_STORED');
  const revision = revisionView(row);
  await appendInitialVisualManifestInTransaction(client, input, revision, input.basedOnRevision);
  await writeReceipt(client, input, revision.revision);
  return { kind: 'saved', revision };
}

/** The owner-qualified draft lock serializes CAS, nonce replay and identity allocation. */
export class PostgresCampaignRevisionRepository implements CampaignRevisionRepository {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  async #transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    let client: pg.PoolClient | undefined;
    try {
      client = await this.#pool.connect();
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch {
      await client?.query('ROLLBACK').catch(() => undefined);
      throw new Error('CAMPAIGN_PACKAGE_STORAGE_UNAVAILABLE');
    } finally {
      client?.release();
    }
  }

  async append(raw: AppendCampaignRevision): Promise<AppendCampaignRevisionResult> {
    const input = normalizeCampaignAppend(raw);
    return this.#transaction((client) => appendCampaignRevisionInTransaction(client, input));
  }
  identityRecords(ownerId: string, draftId: string, content: CampaignPackage) {
    return this.#transaction((client) => readIdentityRecords(client, ownerId, draftId, content));
  }

  latest(ownerId: string, draftId: string): Promise<CampaignRevision | null> {
    return this.#transaction(async (client) => {
      const rows = await client.query<RevisionRow>(
        `SELECT ${COLUMNS} FROM ltw_campaign_package_revisions WHERE owner_id = $1 AND draft_id = $2 ORDER BY revision DESC LIMIT 1`,
        [ownerId, draftId],
      );
      return rows.rows[0] ? revisionView(rows.rows[0]) : null;
    });
  }
  get(ownerId: string, draftId: string, revision: number): Promise<CampaignRevision | null> {
    return this.#transaction(async (client) => {
      const rows = await client.query<RevisionRow>(
        `SELECT ${COLUMNS} FROM ltw_campaign_package_revisions WHERE owner_id = $1 AND draft_id = $2 AND revision = $3`,
        [ownerId, draftId, revision],
      );
      return rows.rows[0] ? revisionView(rows.rows[0]) : null;
    });
  }
  list(
    ownerId: string,
    draftId: string,
    before: number | null,
    limit: number,
  ): Promise<readonly CampaignRevisionSummary[]> {
    return this.#transaction(async (client) => {
      const rows = await client.query<
        Omit<RevisionRow, 'content' | 'identities' | 'request_fingerprint'> & { title: string }
      >(
        `SELECT draft_id, owner_id, revision, based_on_revision, digest, source, created_at,
           content->'world'->>'name' AS title FROM ltw_campaign_package_revisions
        WHERE owner_id = $1 AND draft_id = $2 AND ($3::integer IS NULL OR revision < $3)
        ORDER BY revision DESC LIMIT $4`,
        [ownerId, draftId, before, limit],
      );
      return rows.rows.map((row) => {
        const source = parseStoredCampaignSource(row.source);
        if (
          typeof row.title !== 'string' ||
          row.title.length < 1 ||
          row.title.length > 120 ||
          (source.kind === 'OWNER' && source.actorId !== row.owner_id)
        )
          throw new Error('CORRUPT_CAMPAIGN_REVISION');
        return {
          revision: row.revision,
          basedOnRevision: row.based_on_revision,
          digest: row.digest,
          source,
          createdAt: row.created_at.toISOString(),
          title: row.title,
        };
      });
    });
  }
}
