import type pg from 'pg';

import { fixedStep } from '../ai/accounting/deadline.ts';
import { readCommitted } from '../ai/accounting/pg-transaction.ts';
import type { Authorization } from '../ai/accounting/types.ts';

/** An open transaction: the accounting `Tx` or a pool client inside BEGIN. */
interface Reader {
  query<R extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<pg.QueryResult<R>>;
}

/**
 * Paid workshop pictures need the owner's own grant (Gate 07, G07-02; migration 0024), as text
 * preparation needs `preparation-grant`: the installation's UNLIMITED image policy alone admits no
 * owner. Checked when pictures are offered, when a job is queued and when its charge is reserved.
 */
export async function pictureGrantEnabled(tx: Reader, ownerId: string): Promise<boolean> {
  const row = (
    await tx.query<{ enabled: boolean }>(
      'SELECT enabled FROM ltw_workshop_picture_grants WHERE owner_id = $1::uuid ORDER BY revision DESC LIMIT 1',
      [ownerId],
    )
  ).rows[0];
  return row?.enabled === true;
}

/** Operator only (`pnpm ai:operator picture-grant`); a new revision, never an edit. */
export function grantWorkshopPictures(
  pool: pg.Pool,
  input: { ownerId: string; enabled: boolean; authorization: Authorization },
): Promise<number> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    // Exclusive against the shared policy every reservation takes: a disable admits no later charge.
    await tx.policy('exclusive');
    const revision =
      ((
        await tx.query<{ revision: number }>(
          'SELECT revision FROM ltw_workshop_picture_grants WHERE owner_id = $1::uuid ORDER BY revision DESC LIMIT 1',
          [input.ownerId],
        )
      ).rows[0]?.revision ?? 0) + 1;
    await tx.query(
      `INSERT INTO ltw_workshop_picture_grants
      (owner_id, revision, enabled, authorized_by, authorized_on, authorization_source)
      VALUES ($1::uuid,$2,$3,$4,$5::date,$6)`,
      [
        input.ownerId,
        revision,
        input.enabled,
        input.authorization.ownerId,
        input.authorization.authorizedOn,
        input.authorization.source,
      ],
    );
    return revision;
  });
}
