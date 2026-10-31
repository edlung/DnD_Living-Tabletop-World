import type {
  CampaignGenerationCandidate,
  CampaignRevision,
  DraftLockSnapshot,
  DraftVisualManifest,
} from '@ltw/contracts';
import { replaceDraftLocksSchema } from '@ltw/contracts';
import { validateCampaignEditOutput } from '@ltw/domain';
import type pg from 'pg';

import { imageDigest } from '../images/manifest.ts';
import { parseCampaignEditSpec } from '../generation/edit-spec.ts';
import { ensureManifest } from '../images/postgres-manifests.ts';
import { assessCampaignRevision } from '../packages/compiler.ts';
import { parseStoredCampaignContent, parseStoredCampaignSource } from '../packages/content.ts';
import {
  appendCampaignRevisionInTransaction,
  readCampaignRevisionInTransaction,
} from '../packages/postgres-store.ts';
import { captureDraftLocks, revisionReviewDigest, privateRevisionIntent } from './policy.ts';
import {
  controlDraftLock,
  controlHead,
  currentControlSession,
  ensureDraftLocks,
  insertDraftLocks,
  lockNonce,
  readWriteReceipt,
} from './postgres-helpers.ts';
import type {
  AdoptCampaignCandidate,
  CampaignRevisionControlRepository,
  ControlledRevisionResult,
  ReplaceDraftLocks,
  RestoreCampaignRevision,
  ReviewedRevisionWrite,
  RevisionControlScope,
} from './store.ts';

class RejectedWrite extends Error {
  readonly result: ControlledRevisionResult;
  constructor(result: ControlledRevisionResult) {
    super('REVISION_CONTROL_REJECTED');
    this.result = result;
  }
}
export class PostgresCampaignRevisionControlRepository implements CampaignRevisionControlRepository {
  readonly pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.pool = pool;
  }
  async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof RejectedWrite) return error.result as T;
    } finally {
      client.release();
    }
    // Keep private database/assessment diagnostics out of application error logs.
    throw new Error('REVISION_CONTROL_STORAGE_UNAVAILABLE');
  }
  locks(scope: RevisionControlScope) {
    return this.transaction(async (client) => {
      if (!(await controlDraftLock(client, scope))) return null;
      const head = await controlHead(client, scope);
      return head ? ensureDraftLocks(client, scope, head) : null;
    });
  }
  replaceLocks(
    input: ReplaceDraftLocks,
  ): ReturnType<CampaignRevisionControlRepository['replaceLocks']> {
    const { ownerId, authSessionId } = input;
    const parsed = replaceDraftLocksSchema.parse(privateRevisionIntent(input)),
      fingerprint = imageDigest(parsed);
    return this.transaction(async (client) => {
      if (!(await controlDraftLock(client, input))) return { kind: 'not-found' };
      if (!(await currentControlSession(client, ownerId, authSessionId)))
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      const old = await lockNonce(client, input, input.requestId, fingerprint);
      if (old) return old;
      const head = await controlHead(client, input);
      if (!head) return { kind: 'not-found' };
      if (head.revision !== input.revision || head.digest !== input.packageDigest)
        return { kind: 'conflict', reason: 'STALE_REVISION' };
      const locks = await ensureDraftLocks(client, input, head);
      if (locks.version !== input.expectedLockVersion)
        return { kind: 'conflict', reason: 'STALE_LOCKS' };
      const manifest = await ensureManifest(client, input, head);
      if (manifest.version !== input.manifestVersion || manifest.digest !== input.manifestDigest)
        return { kind: 'conflict', reason: 'STALE_MANIFEST' };
      const entries = captureDraftLocks(head, manifest, input.targets);
      if (!entries) return { kind: 'conflict', reason: 'INVALID_TARGET' };
      return {
        kind: 'saved',
        locks: await insertDraftLocks(
          client,
          input,
          head,
          locks.version + 1,
          entries,
          input.requestId,
          fingerprint,
        ),
      };
    });
  }
  adopt(input: AdoptCampaignCandidate) {
    return this.transaction(async (client) => {
      const initial = await this.prepare(client, input, 'ADOPTION');
      if ('kind' in initial) return initial;
      const row = (
        await client.query<{
          content: unknown;
          content_digest: string;
          source: unknown;
          created_at: Date;
          base_revision: number;
          mode: string;
          edit_spec: unknown;
        }>(
          `SELECT c.content,c.content_digest,c.source,c.created_at,
        j.base_revision,j.mode,j.edit_spec FROM ltw_campaign_generation_candidates c JOIN ltw_campaign_generation_jobs j
        ON j.owner_id=c.owner_id AND j.draft_id=c.draft_id AND j.job_id=c.job_id
        WHERE c.owner_id=$1 AND c.draft_id=$2 AND c.job_id=$3 AND j.status='SUCCEEDED' AND j.candidate_available
        FOR SHARE OF j`,
          [input.ownerId, input.draftId, input.jobId],
        )
      ).rows[0];
      if (!row) return { kind: 'not-found' } as const;
      const candidate: CampaignGenerationCandidate = {
        jobId: input.jobId,
        draftId: input.draftId,
        baseRevision: row.base_revision,
        content: parseStoredCampaignContent(row.content),
        contentDigest: row.content_digest,
        source: parseStoredCampaignSource(row.source),
        createdAt: row.created_at.toISOString(),
      };
      if (imageDigest(candidate.content) !== candidate.contentDigest)
        throw new Error('CORRUPT_CANDIDATE');
      if (
        candidate.contentDigest !== input.candidateDigest ||
        candidate.source.kind !== 'AI' ||
        candidate.source.jobId !== input.jobId
      )
        return { kind: 'conflict', reason: 'INVALID_CANDIDATE' } as const;
      if (candidate.baseRevision !== initial.head.revision)
        return { kind: 'conflict', reason: 'STALE_REVISION' } as const;
      if (
        row.mode === 'EDIT' &&
        !validateCampaignEditOutput(
          initial.head,
          candidate.content,
          parseCampaignEditSpec(row.edit_spec),
        ).ok
      )
        return { kind: 'conflict', reason: 'INVALID_CANDIDATE' } as const;
      if (
        revisionReviewDigest({
          kind: 'ADOPTION',
          sourceId: input.jobId,
          sourceDigest: candidate.contentDigest,
          headDigest: initial.head.digest,
          lockDigest: initial.locks.digest,
          manifestDigest: initial.manifest.digest,
        }) !== input.reviewDigest
      )
        return { kind: 'conflict', reason: 'STALE_REVIEW' } as const;
      const saved = await appendCampaignRevisionInTransaction(client, {
        ownerId: input.ownerId,
        draftId: input.draftId,
        requestId: input.requestId,
        basedOnRevision: input.basedOnRevision,
        content: candidate.content,
        source: candidate.source,
        createdAt: new Date().toISOString(),
        expectedLockVersion: input.expectedLockVersion,
        writePolicy: { operation: 'ADOPTION', intent: this.intent(input) },
      });
      if (saved.kind === 'conflict')
        return {
          kind: 'conflict',
          reason: saved.reason === 'IDENTITY_KIND_CHANGED' ? 'INVALID_CANDIDATE' : saved.reason,
        } as const;
      if (saved.kind === 'saved') {
        const assessment = await assessCampaignRevision(saved.revision, input.ownerId);
        if (assessment.readiness === 'INVALID')
          throw new RejectedWrite({ kind: 'conflict', reason: 'INVALID_CANDIDATE' });
        if (!(await currentControlSession(client, input.ownerId, input.authSessionId)))
          throw new RejectedWrite({ kind: 'conflict', reason: 'STALE_REVIEW' });
      }
      return saved;
    });
  }
  restore(input: RestoreCampaignRevision) {
    return this.transaction(async (client) => {
      const initial = await this.prepare(client, input, 'RESTORE');
      if ('kind' in initial) return initial;
      const historical = await readCampaignRevisionInTransaction(
        client,
        input.ownerId,
        input.draftId,
        input.restoreRevision,
      );
      if (!historical) return { kind: 'not-found' } as const;
      if (
        revisionReviewDigest({
          kind: 'RESTORE',
          sourceId: String(input.restoreRevision),
          sourceDigest: historical.digest,
          headDigest: initial.head.digest,
          lockDigest: initial.locks.digest,
          manifestDigest: initial.manifest.digest,
        }) !== input.reviewDigest
      )
        return { kind: 'conflict', reason: 'STALE_REVIEW' } as const;
      const saved = await appendCampaignRevisionInTransaction(client, {
        ownerId: input.ownerId,
        draftId: input.draftId,
        requestId: input.requestId,
        basedOnRevision: input.basedOnRevision,
        content: historical.content,
        source: { kind: 'OWNER', actorId: input.ownerId },
        createdAt: new Date().toISOString(),
        expectedLockVersion: input.expectedLockVersion,
        writePolicy: { operation: 'RESTORE', intent: this.intent(input) },
      });
      return saved.kind === 'conflict'
        ? {
            kind: 'conflict' as const,
            reason:
              saved.reason === 'IDENTITY_KIND_CHANGED'
                ? ('INVALID_CANDIDATE' as const)
                : saved.reason,
          }
        : saved;
    });
  }
  intent(input: ReviewedRevisionWrite) {
    return privateRevisionIntent(input);
  }
  async prepare(
    client: pg.PoolClient,
    input: ReviewedRevisionWrite,
    operation: 'ADOPTION' | 'RESTORE',
  ): Promise<
    | ControlledRevisionResult
    | { head: CampaignRevision; locks: DraftLockSnapshot; manifest: DraftVisualManifest }
  > {
    if (!(await controlDraftLock(client, input))) return { kind: 'not-found' } as const;
    if (!(await currentControlSession(client, input.ownerId, input.authSessionId)))
      return { kind: 'conflict', reason: 'STALE_REVIEW' } as const;
    const receipt = await readWriteReceipt(client, input, input.requestId);
    if (receipt) {
      const intent = receipt.intent as { operation?: unknown; intent?: unknown };
      if (
        intent.operation !== operation ||
        imageDigest(intent.intent) !== imageDigest(this.intent(input))
      )
        return { kind: 'conflict', reason: 'REQUEST_REUSED' } as const;
      const revision = await readCampaignRevisionInTransaction(
        client,
        input.ownerId,
        input.draftId,
        receipt.revision,
      );
      if (!revision) throw new Error('RECEIPT_REVISION_MISSING');
      return { kind: 'saved', revision } as const;
    }
    const head = await controlHead(client, input);
    if (!head) return { kind: 'not-found' } as const;
    if (head.revision !== input.basedOnRevision || head.digest !== input.packageDigest)
      return { kind: 'conflict', reason: 'STALE_REVISION' } as const;
    const locks = await ensureDraftLocks(client, input, head);
    if (locks.version !== input.expectedLockVersion)
      return { kind: 'conflict', reason: 'STALE_LOCKS' } as const;
    const manifest = await ensureManifest(client, input, head);
    if (manifest.version !== input.manifestVersion || manifest.digest !== input.manifestDigest)
      return { kind: 'conflict', reason: 'STALE_MANIFEST' } as const;
    return { head, locks, manifest };
  }
}
