import type pg from 'pg';

import type { StagedTable } from './stage.ts';

/**
 * The accounts a package brings (docs/adr/0061-local-mode.md §5): people, shared with other
 * campaigns, so merged and never deleted. An account this server has keeps its login and name, and
 * takes the package's password only when that changed later — while the campaign was away and
 * before its package was cut, never in the future — and the account sat in this campaign here
 * before (it came back with it): a package never sets the password of someone this campaign did
 * not hold. A new one comes as it is; when its login belongs to someone else here, it gets the
 * first free number after it (`masha-2`), reported.
 */
export interface AccountsMerged {
  readonly created: number;
  readonly passwordsChanged: number;
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
}

interface StagedAccount {
  readonly account_id: string;
  readonly login: string;
  readonly password_hash: string;
  readonly display_name: string;
  readonly created_at: Date;
  readonly password_changed_at: Date;
}

const LOGIN_LIMIT = 32;

export async function mergeAccounts(
  client: pg.ClientBase,
  staged: StagedTable,
  /** The accounts that sat in this campaign here before the import changed anything. */
  seatedHere: ReadonlySet<string>,
  /** When a password the package carries may have changed: while the campaign was away. */
  window: { readonly from: Date; readonly to: Date } | null,
): Promise<AccountsMerged> {
  const { rows } = await client.query<StagedAccount & { here: boolean; here_changed: Date | null }>(
    `SELECT s.*, a.account_id IS NOT NULL AS here, a.password_changed_at AS here_changed
       FROM ${staged.stage} s LEFT JOIN ltw_accounts a ON a.account_id = s.account_id
      ORDER BY s.account_id`,
  );
  let created = 0;
  let passwordsChanged = 0;
  const renamed: { from: string; to: string }[] = [];
  for (const account of rows) {
    if (account.here) {
      const changed = account.password_changed_at;
      const later = account.here_changed !== null && changed > account.here_changed;
      const meanwhile = window !== null && changed >= window.from && changed <= window.to;
      if (seatedHere.has(account.account_id) && later && meanwhile) {
        await client.query(
          `UPDATE ltw_accounts SET password_hash = $2, password_changed_at = $3 WHERE account_id = $1`,
          [account.account_id, account.password_hash, account.password_changed_at],
        );
        passwordsChanged += 1;
      }
      continue;
    }
    const login = await freeLogin(client, account.login);
    if (login !== account.login) renamed.push({ from: account.login, to: login });
    await client.query(
      `INSERT INTO ltw_accounts
         (account_id, login, password_hash, display_name, created_at, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        account.account_id,
        login,
        account.password_hash,
        account.display_name,
        account.created_at,
        account.password_changed_at,
      ],
    );
    created += 1;
  }
  return { created, passwordsChanged, renamed };
}

/** The login if nobody here holds it, else the first free `login-N` within the login's limit. */
async function freeLogin(client: pg.ClientBase, login: string): Promise<string> {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? '' : `-${String(number)}`;
    const candidate = `${login.slice(0, LOGIN_LIMIT - suffix.length)}${suffix}`;
    const { rowCount } = await client.query('SELECT 1 FROM ltw_accounts WHERE login = $1', [
      candidate,
    ]);
    if (rowCount === 0) return candidate;
  }
}
