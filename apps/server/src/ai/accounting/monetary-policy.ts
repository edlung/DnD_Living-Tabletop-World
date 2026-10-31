import type pg from 'pg';

import { IMAGE_LEDGER_LOCK_KEY } from '../../images/ledger-lock.ts';
import { fixedStep } from './deadline.ts';
import { readCommitted, type Tx } from './pg-transaction.ts';
import { AccountingRejection, type Authorization } from './types.ts';

/** Numeric historical ceilings are retained; only an explicit stored policy supersedes them. */
export type MonetaryMode = 'FINITE' | 'UNLIMITED';
export type MonetaryPolicyTarget =
  { readonly scope: 'text'; readonly accountId: string } | { readonly scope: 'images' };

export interface MonetaryPolicyRevision {
  readonly revision: number;
  readonly mode: MonetaryMode;
  readonly ownerId: string;
  readonly authorizedOn: string;
  readonly authorizationSource: string;
}

type Reader = Pick<Tx, 'query'>;
const COLUMNS = `revision, mode, owner_id AS "ownerId",
  to_char(authorized_on, 'YYYY-MM-DD') AS "authorizedOn",
  authorization_source AS "authorizationSource"`;

/** Read while holding the shared policy lock for dispatch/settlement decisions. */
export async function readMonetaryPolicy(
  tx: Reader,
  target: MonetaryPolicyTarget,
): Promise<MonetaryPolicyRevision | null> {
  const result =
    target.scope === 'text'
      ? await tx.query<MonetaryPolicyRevision>(
          `SELECT ${COLUMNS} FROM ltw_ai_text_policies
         WHERE account_id = $1 ORDER BY revision DESC LIMIT 1`,
          [target.accountId],
        )
      : await tx.query<MonetaryPolicyRevision>(
          `SELECT ${COLUMNS} FROM ltw_image_policies ORDER BY revision DESC LIMIT 1`,
        );
  return result.rows[0] ?? null;
}

export async function unlimitedText(tx: Reader, accountId: string): Promise<boolean> {
  return (await readMonetaryPolicy(tx, { scope: 'text', accountId }))?.mode === 'UNLIMITED';
}

export function monetaryPolicyStatus(
  pool: pg.Pool,
  target: MonetaryPolicyTarget,
): Promise<MonetaryPolicyRevision | null> {
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.policy('shared');
    return readMonetaryPolicy(tx, target);
  });
}

/** Operator-only append. Serializes against all admissions and the image ledger. */
export function setMonetaryPolicy(
  pool: pg.Pool,
  input: MonetaryPolicyTarget & {
    readonly mode: MonetaryMode;
    readonly authorization: Authorization;
  },
): Promise<number> {
  if (!['FINITE', 'UNLIMITED'].includes(input.mode) || !['text', 'images'].includes(input.scope)) {
    throw new AccountingRejection('INVALID_MONETARY_POLICY');
  }
  return readCommitted(pool, fixedStep(), async (tx) => {
    await tx.policy('exclusive');
    if (input.scope === 'text') {
      const account = await tx.query(
        'SELECT 1 FROM ltw_ai_billing_accounts WHERE account_id = $1',
        [input.accountId],
      );
      if (account.rowCount !== 1) throw new AccountingRejection('UNKNOWN_ACCOUNT');
    } else {
      await tx.lock(IMAGE_LEDGER_LOCK_KEY, 'exclusive');
    }
    const revision = ((await readMonetaryPolicy(tx, input))?.revision ?? 0) + 1;
    const authorization = [
      input.authorization.ownerId,
      input.authorization.authorizedOn,
      input.authorization.source,
    ];
    if (input.scope === 'text') {
      await tx.query(
        `INSERT INTO ltw_ai_text_policies
           (account_id, revision, mode, owner_id, authorized_on, authorization_source)
         VALUES ($1, $2, $3, $4, $5::date, $6)`,
        [input.accountId, revision, input.mode, ...authorization],
      );
    } else {
      await tx.query(
        `INSERT INTO ltw_image_policies
           (revision, mode, owner_id, authorized_on, authorization_source)
         VALUES ($1, $2, $3, $4::date, $5)`,
        [revision, input.mode, ...authorization],
      );
    }
    return revision;
  });
}
