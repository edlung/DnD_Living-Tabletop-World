import { randomUUID } from 'node:crypto';

import type { AssetMediaType, DraftImageCandidate, DraftImageJob } from '@ltw/contracts';
import type pg from 'pg';

import { checkContent, contentHashOf } from '../../assets/content-store.ts';
import { pictureGrantEnabled } from '../../images/picture-grants.ts';
import { OWNERS_IN_TURN, pictureJobAllowed } from '../job-limits.ts';
import { readCampaignRevisionInTransaction } from '../packages/postgres-store.ts';
import {
  claimImage,
  renewImage,
  beginImageDispatch,
  completeImage,
  failImage,
} from './postgres-jobs.ts';
import { ensureManifest } from './postgres-manifests.ts';
import {
  imageCandidate,
  imageDraftLock,
  imageJob,
  imageJobView,
  imageKeys,
  imageSession,
  imageTransaction,
  publicImageJob,
  candidateView,
  CANDIDATE_SELECT,
  IMAGE_PUBLIC_COLUMNS,
  type ImageRow,
  type PublicImageRow,
  type CandidateRow,
} from './postgres-rows.ts';
import { selectImage } from './postgres-selection.ts';
import { checkedImageRequest, imageRequestFingerprint, preparedImageMatches } from './requests.ts';
import type {
  DraftImageRepository,
  DraftImageScope,
  DraftImageJobScope,
  DraftImageLease,
  RequestDraftImage,
  SelectDraftImage,
  ImageJobMutation,
  ImageRequestMutation,
} from './store.ts';

const bounded = (limit: number) => Math.max(1, Math.min(50, Math.trunc(limit)));
export class PostgresDraftImageRepository implements DraftImageRepository {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  request(raw: RequestDraftImage): Promise<ImageRequestMutation> {
    const input = checkedImageRequest(raw);
    return imageTransaction(this.#pool, async (client) => {
      if (!(await imageDraftLock(client, input))) return { kind: 'not-found' };
      if (!(await imageSession(client, input.ownerId, input.authSessionId)))
        return { kind: 'conflict' };
      const fingerprint = imageRequestFingerprint(input);
      const prior = (
        await client.query<ImageRow>(
          'SELECT * FROM ltw_workshop_image_jobs WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3',
          [input.ownerId, input.draftId, input.requestId],
        )
      ).rows[0];
      if (prior)
        return prior.request_fingerprint === fingerprint
          ? { kind: 'saved', job: imageJobView(prior) }
          : { kind: 'conflict' };
      // Gate 07: the owner's picture grant (G07-02) and active-job bound (G07-01), under the lock.
      if (!(await pictureGrantEnabled(client, input.ownerId))) return { kind: 'no-grant' };
      if (!(await pictureJobAllowed(client, input.ownerId))) return { kind: 'busy' };
      const revision = await readCampaignRevisionInTransaction(
        client,
        input.ownerId,
        input.draftId,
        input.revision,
      );
      if (!revision) return { kind: 'not-found' };
      const manifest = await ensureManifest(client, input, revision);
      if (
        revision.digest !== input.packageDigest ||
        manifest.version !== input.expectedManifestVersion ||
        !preparedImageMatches(input, revision, manifest)
      )
        return { kind: 'conflict' };
      const job = (
        await client.query<ImageRow>(
          `INSERT INTO ltw_workshop_image_jobs(job_id,owner_id,draft_id,auth_session_id,request_id,request_fingerprint,
   revision,package_digest,entity_id,purpose,variant,label,input,source_signature,provider,model,request_digest,status,created_at,updated_at,expected_manifest_version)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,'QUEUED',clock_timestamp(),clock_timestamp(),$18) RETURNING *`,
          [
            randomUUID(),
            input.ownerId,
            input.draftId,
            input.authSessionId,
            input.requestId,
            fingerprint,
            input.revision,
            input.packageDigest,
            input.input.subject.entityId,
            input.input.purpose,
            input.input.variant,
            input.input.label,
            JSON.stringify(input.input),
            input.sourceSignature,
            input.provider,
            input.model,
            input.requestDigest,
            input.expectedManifestVersion,
          ],
        )
      ).rows[0];
      if (!job) throw new Error('IMAGE_JOB_NOT_STORED');
      return { kind: 'saved', job: imageJobView(job) };
    });
  }
  get(scope: DraftImageJobScope) {
    return imageTransaction(this.#pool, async (client) => {
      const row = await imageJob(client, scope);
      return row ? imageJobView(row) : null;
    });
  }
  requestById(scope: DraftImageScope, requestId: string) {
    return imageTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<ImageRow>(
          'SELECT * FROM ltw_workshop_image_jobs WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3',
          [scope.ownerId, scope.draftId, requestId],
        )
      ).rows[0];
      return row ? imageJobView(row) : null;
    });
  }
  list(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageJob, 'createdAt' | 'jobId'> | null,
  ) {
    return imageTransaction(this.#pool, async (client) => {
      const rows = await client.query<PublicImageRow>(
        `SELECT ${IMAGE_PUBLIC_COLUMNS} FROM ltw_workshop_image_jobs WHERE owner_id=$1 AND draft_id=$2 AND revision=$3
   AND($4::timestamptz IS NULL OR(created_at,job_id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,job_id DESC LIMIT $6`,
        [
          scope.ownerId,
          scope.draftId,
          revision,
          before?.createdAt ?? null,
          before?.jobId ?? null,
          bounded(limit),
        ],
      );
      return rows.rows.map(publicImageJob);
    });
  }
  pending(limit: number) {
    return imageTransaction(this.#pool, async (client) => {
      const rows = await client.query<{ owner_id: string; draft_id: string; job_id: string }>(
        `SELECT owner_id,draft_id,job_id FROM (SELECT owner_id,draft_id,job_id,created_at,
   ${OWNERS_IN_TURN} AS turn FROM ltw_workshop_image_jobs
   WHERE status='QUEUED' OR(status='RUNNING' AND lease_until<=clock_timestamp())) pending
   ORDER BY turn,created_at,job_id LIMIT $1`,
        [bounded(limit)],
      );
      return rows.rows.map((row) => ({
        ownerId: row.owner_id,
        draftId: row.draft_id,
        jobId: row.job_id,
      }));
    });
  }
  claim(scope: DraftImageJobScope, workerId: string) {
    return imageTransaction(this.#pool, (client) => claimImage(client, scope, workerId));
  }
  renew(lease: DraftImageLease) {
    return imageTransaction(this.#pool, (client) => renewImage(client, lease));
  }
  beginDispatch(
    lease: DraftImageLease,
    proof: Parameters<DraftImageRepository['beginDispatch']>[1],
  ) {
    return imageTransaction(this.#pool, (client) => beginImageDispatch(client, lease, proof));
  }
  complete(lease: DraftImageLease, result: Parameters<DraftImageRepository['complete']>[1]) {
    return imageTransaction(this.#pool, (client) => completeImage(client, lease, result));
  }
  fail(lease: DraftImageLease, code: string, uncertain = false) {
    return imageTransaction(this.#pool, (client) => failImage(client, lease, code, uncertain));
  }
  cancel(scope: DraftImageJobScope): Promise<ImageJobMutation> {
    return imageTransaction(this.#pool, async (client) => {
      const row = await imageJob(client, scope, true);
      if (!row) return { kind: 'not-found' };
      if (row.status === 'CANCELLED') return { kind: 'saved', job: imageJobView(row) };
      if (!['QUEUED', 'RUNNING'].includes(row.status)) return { kind: 'conflict' };
      const changed = (
        await client.query<ImageRow>(
          `UPDATE ltw_workshop_image_jobs SET status='CANCELLED',fence=fence+1,lease_until=NULL,updated_at=clock_timestamp()
   WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3 RETURNING *`,
          imageKeys(scope),
        )
      ).rows[0];
      if (!changed) throw new Error('IMAGE_CANCEL_NOT_STORED');
      return { kind: 'saved', job: imageJobView(changed) };
    });
  }
  candidate(scope: DraftImageScope, candidateId: string) {
    return imageTransaction(this.#pool, (client) => imageCandidate(client, scope, candidateId));
  }
  candidates(
    scope: DraftImageScope,
    revision: number,
    limit: number,
    before?: Pick<DraftImageCandidate, 'createdAt' | 'candidateId'> | null,
    entityId?: string,
  ) {
    return imageTransaction(this.#pool, async (client) => {
      const rows = await client.query<CandidateRow>(
        `${CANDIDATE_SELECT} WHERE c.owner_id=$1 AND c.draft_id=$2 AND j.revision=$3
   AND($4::timestamptz IS NULL OR(c.created_at,c.candidate_id)<($4::timestamptz,$5::uuid)) AND($6::uuid IS NULL OR j.entity_id=$6)
   ORDER BY c.created_at DESC,c.candidate_id DESC LIMIT $7`,
        [
          scope.ownerId,
          scope.draftId,
          revision,
          before?.createdAt ?? null,
          before?.candidateId ?? null,
          entityId ?? null,
          bounded(limit),
        ],
      );
      return rows.rows.map(candidateView);
    });
  }
  manifest(scope: DraftImageScope, revision: number) {
    return imageTransaction(this.#pool, async (client) => {
      if (!(await imageDraftLock(client, scope))) return null;
      const stored = await readCampaignRevisionInTransaction(
        client,
        scope.ownerId,
        scope.draftId,
        revision,
      );
      return stored ? ensureManifest(client, scope, stored) : null;
    });
  }
  select(input: SelectDraftImage) {
    return imageTransaction(this.#pool, (client) => selectImage(client, input));
  }
  content(scope: DraftImageScope, hash: string) {
    return imageTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<{ bytes: Buffer; media_type: AssetMediaType }>(
          'SELECT bytes,media_type FROM ltw_workshop_image_contents WHERE owner_id=$1 AND draft_id=$2 AND content_hash=$3',
          [scope.ownerId, scope.draftId, hash],
        )
      ).rows[0];
      if (!row) return null;
      const content = { bytes: new Uint8Array(row.bytes), mediaType: row.media_type };
      checkContent(content);
      if (contentHashOf(content.bytes) !== hash) throw new Error('CORRUPT_DRAFT_IMAGE_BYTES');
      return content;
    });
  }
}
