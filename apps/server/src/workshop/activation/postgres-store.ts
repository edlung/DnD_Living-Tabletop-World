import type { OwnedCampaign } from '@ltw/contracts';
import type pg from 'pg';

import { currentControlSession } from '../revisions/postgres-helpers.ts';
import {
  storedActivation,
  type ActivationRow,
  activationView,
  ACTIVATION_PUBLIC_COLUMNS,
  type PublicActivationRow,
} from './content.ts';
import { beginActivation } from './postgres-begin.ts';
import {
  activeActivationLease,
  activationKeys,
  activationTransaction,
  ACTIVATION_LEASE_SECONDS,
  loadActivation,
  operationKeys,
} from './postgres-common.ts';
import { publishActivation } from './postgres-publish.ts';
import type {
  ActivationScope,
  ActivationOperationScope,
  ActivationLease,
  CampaignActivationRepository,
} from './store.ts';

const limit = (n: number) => Math.max(1, Math.min(50, Math.trunc(n)));
type OwnedRow = Pick<
  ActivationRow,
  | 'campaign_id'
  | 'activation_id'
  | 'draft_id'
  | 'revision'
  | 'title'
  | 'language'
  | 'created_at'
  | 'published_at'
>;
const OWNED_COLUMNS =
  'campaign_id,activation_id,draft_id,revision,title,language,created_at,published_at';
function ownedView(row: OwnedRow): OwnedCampaign {
  if (!row.published_at) throw new Error('OWNED_CAMPAIGN_UNPUBLISHED');
  return {
    campaignId: row.campaign_id,
    activationId: row.activation_id,
    draftId: row.draft_id,
    revision: row.revision,
    title: row.title,
    language: row.language,
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at.toISOString(),
  };
}
export class PostgresCampaignActivationRepository implements CampaignActivationRepository {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  status(scope: ActivationScope) {
    return activationTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<PublicActivationRow>(
          `SELECT ${ACTIVATION_PUBLIC_COLUMNS} FROM ltw_workshop_campaign_activations
        WHERE owner_id=$1 AND draft_id=$2`,
          activationKeys(scope),
        )
      ).rows[0];
      return row ? activationView(row) : null;
    });
  }
  get(scope: ActivationScope) {
    return activationTransaction(this.#pool, (client) => loadActivation(client, scope));
  }
  byRequest(scope: ActivationScope, requestId: string) {
    return activationTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<ActivationRow>(
          `SELECT * FROM ltw_workshop_campaign_activations
        WHERE owner_id=$1 AND draft_id=$2 AND request_id=$3`,
          [...activationKeys(scope), requestId],
        )
      ).rows[0];
      return row ? storedActivation(row) : null;
    });
  }
  begin(input: Parameters<CampaignActivationRepository['begin']>[0]) {
    return activationTransaction(this.#pool, (client) => beginActivation(client, input));
  }
  retry(
    scope: ActivationOperationScope,
    authSessionId: string,
  ): ReturnType<CampaignActivationRepository['retry']> {
    return activationTransaction(this.#pool, async (client) => {
      if (!(await currentControlSession(client, scope.ownerId, authSessionId)))
        return { kind: 'conflict', reason: 'STALE_REVIEW' };
      const activation = await loadActivation(client, scope, true);
      if (!activation || activation.activationId !== scope.activationId)
        return { kind: 'not-found' };
      if (activation.status === 'PUBLISHED') return { kind: 'saved', activation };
      if (!activation.retryable) return { kind: 'conflict', reason: 'NOT_READY' };
      await client.query(
        `UPDATE ltw_workshop_campaign_activations SET next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3`,
        operationKeys(scope),
      );
      const saved = await loadActivation(client, scope);
      if (!saved) throw new Error('ACTIVATION_MISSING');
      return { kind: 'saved', activation: saved };
    });
  }
  pending(max: number) {
    return activationTransaction(this.#pool, async (client) =>
      (
        await client.query<{ owner_id: string; draft_id: string; activation_id: string }>(
          `SELECT owner_id,draft_id,activation_id FROM ltw_workshop_campaign_activations WHERE status='PROVISIONING' AND retryable
      AND (lease_until IS NULL OR lease_until<=clock_timestamp()) AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp())
      ORDER BY created_at,activation_id LIMIT $1`,
          [limit(max)],
        )
      ).rows.map((row) => ({
        ownerId: row.owner_id,
        draftId: row.draft_id,
        activationId: row.activation_id,
      })),
    );
  }
  claim(scope: ActivationOperationScope, workerId: string) {
    return activationTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<ActivationRow>(
          `UPDATE ltw_workshop_campaign_activations SET fence=fence+1,worker_id=$4,
        lease_until=clock_timestamp()+$5*interval '1 second',next_attempt_at=NULL,updated_at=clock_timestamp()
        WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3 AND status='PROVISIONING' AND retryable
        AND (lease_until IS NULL OR lease_until<=clock_timestamp()) AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp()) RETURNING *`,
          [...operationKeys(scope), workerId, ACTIVATION_LEASE_SECONDS],
        )
      ).rows[0];
      return row
        ? { activation: storedActivation(row), lease: { ...scope, workerId, fence: row.fence } }
        : null;
    });
  }
  renew(lease: ActivationLease) {
    return activationTransaction(this.#pool, async (client) => {
      if (!(await activeActivationLease(client, lease))) return false;
      return (
        (
          await client.query(
            `UPDATE ltw_workshop_campaign_activations SET lease_until=clock_timestamp()+$4*interval '1 second',
        updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3 AND lease_until>clock_timestamp()
        AND status='PROVISIONING'`,
            [...operationKeys(lease), ACTIVATION_LEASE_SECONDS],
          )
        ).rowCount === 1
      );
    });
  }
  phase(lease: ActivationLease, phase: 'CONTENT_READY' | 'BOOTSTRAPPED') {
    return activationTransaction(this.#pool, async (client) => {
      if (!(await activeActivationLease(client, lease))) return false;
      return (
        (
          await client.query(
            `UPDATE ltw_workshop_campaign_activations SET phase=CASE WHEN
        array_position(ARRAY['RESERVED','CONTENT_READY','BOOTSTRAPPED'],phase)<array_position(ARRAY['RESERVED','CONTENT_READY','BOOTSTRAPPED'],$4)
        THEN $4 ELSE phase END,updated_at=clock_timestamp() WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3
        AND lease_until>clock_timestamp() AND status='PROVISIONING'`,
            [...operationKeys(lease), phase],
          )
        ).rowCount === 1
      );
    });
  }
  fail(lease: ActivationLease, code: string, retryable: boolean) {
    if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(code)) throw new Error('INVALID_ACTIVATION_FAILURE');
    return activationTransaction(this.#pool, async (client) => {
      if (!(await activeActivationLease(client, lease))) return false;
      return (
        (
          await client.query(
            `UPDATE ltw_workshop_campaign_activations SET failure_code=$4,retryable=$5,lease_until=NULL,
        next_attempt_at=CASE WHEN $5 THEN clock_timestamp()+interval '5 seconds' ELSE NULL END,updated_at=clock_timestamp()
        WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3 AND lease_until>clock_timestamp()
        AND status='PROVISIONING'`,
            [...operationKeys(lease), code, retryable],
          )
        ).rowCount === 1
      );
    });
  }
  publish(lease: ActivationLease, proof: Parameters<CampaignActivationRepository['publish']>[1]) {
    return activationTransaction(this.#pool, (client) => publishActivation(client, lease, proof));
  }
  owned(
    ownerId: string,
    max: number,
    before?: Pick<OwnedCampaign, 'publishedAt' | 'activationId'> | null,
  ) {
    return activationTransaction(this.#pool, async (client) =>
      (
        await client.query<OwnedRow>(
          `SELECT ${OWNED_COLUMNS}
      FROM ltw_workshop_campaign_activations WHERE owner_id=$1 AND status='PUBLISHED'
      AND ($3::timestamptz IS NULL OR (published_at,activation_id)<($3::timestamptz,$4::uuid))
      ORDER BY published_at DESC,activation_id DESC LIMIT $2`,
          [ownerId, limit(max), before?.publishedAt ?? null, before?.activationId ?? null],
        )
      ).rows.map(ownedView),
    );
  }
  ownedCampaign(ownerId: string, campaignId: string) {
    return this.#owned(ownerId, 'campaign_id', campaignId);
  }
  ownedActivation(ownerId: string, activationId: string) {
    return this.#owned(ownerId, 'activation_id', activationId);
  }
  #owned(ownerId: string, column: 'campaign_id' | 'activation_id', id: string) {
    return activationTransaction(this.#pool, async (client) => {
      const row = (
        await client.query<OwnedRow>(
          `SELECT ${OWNED_COLUMNS} FROM ltw_workshop_campaign_activations
        WHERE owner_id=$1 AND ${column}=$2 AND status='PUBLISHED'`,
          [ownerId, id],
        )
      ).rows[0];
      return row ? ownedView(row) : null;
    });
  }
}
