import type { CampaignIdentities, CampaignRevision, CampaignRevisionSummary } from '@ltw/contracts';
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
  if (previous)
    return previous.request_fingerprint === fingerprint
      ? { kind: 'saved', revision: revisionView(previous) }
      : { kind: 'conflict', reason: 'REQUEST_REUSED' };
  const latest =
    (
      await client.query<{ revision: number }>(
        'SELECT revision FROM ltw_campaign_package_revisions WHERE draft_id = $1 AND owner_id = $2 ORDER BY revision DESC LIMIT 1',
        [input.draftId, input.ownerId],
      )
    ).rows[0]?.revision ?? 0;
  if (latest !== input.basedOnRevision) return { kind: 'conflict', reason: 'STALE_REVISION' };
  const rows = (
    await client.query<{
      namespace: CampaignIdentityNamespace;
      local_key: string;
      canonical_id: string;
      entity_kind: CampaignIdentityRecord['entityKind'];
    }>(
      'SELECT namespace, local_key, canonical_id, entity_kind FROM ltw_campaign_package_identities WHERE draft_id = $1 AND owner_id = $2',
      [input.draftId, input.ownerId],
    )
  ).rows;
  const registry: CampaignIdentityRecord[] = rows.map((row) => ({
    namespace: row.namespace,
    key: row.local_key,
    id: row.canonical_id,
    entityKind: row.entity_kind,
  }));
  const allocation = allocateCampaignIdentities(input.content, registry);
  if (allocation.kind === 'conflict') return { kind: 'conflict', reason: 'IDENTITY_KIND_CHANGED' };
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
