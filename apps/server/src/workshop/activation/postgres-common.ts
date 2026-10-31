import type pg from 'pg';
import { storedActivation, type ActivationRow } from './content.ts';
import type { ActivationScope, ActivationOperationScope, ActivationLease } from './store.ts';

export const ACTIVATION_LEASE_SECONDS = 30;
export const activationKeys = (scope: ActivationScope) => [scope.ownerId, scope.draftId];
export const operationKeys = (scope: ActivationOperationScope) => [
  ...activationKeys(scope),
  scope.activationId,
];
export async function activationTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw new Error('CAMPAIGN_ACTIVATION_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}
export async function loadActivation(client: pg.PoolClient, scope: ActivationScope, lock = false) {
  const row = (
    await client.query<ActivationRow>(
      `SELECT * FROM ltw_workshop_campaign_activations
    WHERE owner_id=$1 AND draft_id=$2${lock ? ' FOR UPDATE' : ''}`,
      activationKeys(scope),
    )
  ).rows[0];
  return row ? storedActivation(row) : null;
}
export async function activeActivationLease(client: pg.PoolClient, lease: ActivationLease) {
  const row = (
    await client.query<{ active: boolean }>(
      `SELECT status='PROVISIONING' AND worker_id=$4 AND fence=$5::bigint
    AND lease_until>clock_timestamp() AS active FROM ltw_workshop_campaign_activations
    WHERE owner_id=$1 AND draft_id=$2 AND activation_id=$3 FOR UPDATE`,
      [...operationKeys(lease), lease.workerId, lease.fence],
    )
  ).rows[0];
  return row?.active === true;
}
