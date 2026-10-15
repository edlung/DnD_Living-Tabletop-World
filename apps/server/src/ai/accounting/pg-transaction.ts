import type pg from 'pg';

import { expired, remainingMs, type Deadline } from './deadline.ts';
import { POLICY_LOCK_KEY } from './lock-keys.ts';
import { AccountingRejection } from './types.ts';

/**
 * Bounded READ COMMITTED transactions for the accounting store (docs/adr/0032-live-ai.md,
 * amendment 2026-10-11). One checked-out client per transaction. Every database wait (pool
 * checkout, BEGIN, the isolation check, timeout settings, application SQL and COMMIT) is raced
 * against the same absolute deadline, and the time is rechecked immediately before each statement
 * is sent: with no time left, nothing more is sent. `lock_timeout` and `statement_timeout` are also
 * set locally before each application statement, never to 0 (which PostgreSQL reads as "no limit"),
 * so abandoned server work stays bounded too.
 *
 * A failed transaction is never rolled back at leisure: its connection is destroyed at once, and
 * since COMMIT was never sent nothing of it can commit. A COMMIT that was sent and not confirmed in
 * time, or answered with anything but definite abort evidence, is reported as `commitUnknown`: it
 * may or may not have committed, so callers must treat its effects as possibly durable (a possible
 * hold stays held) and never as a confirmed rollback. A transaction may lower its own deadline
 * (`clamp`) once it learns a tighter database bound.
 */
export class StorageUnavailable extends Error {
  readonly reason: 'timeout' | 'failure';
  /** COMMIT was sent and not confirmed: the transaction may have committed. */
  readonly commitUnknown: boolean;

  constructor(
    reason: 'timeout' | 'failure',
    options?: ErrorOptions & { readonly commitUnknown?: boolean },
  ) {
    super(
      `accounting storage ${reason}${options?.commitUnknown === true ? ', commit unknown' : ''}`,
      options,
    );
    this.name = 'StorageUnavailable';
    this.reason = reason;
    this.commitUnknown = options?.commitUnknown ?? false;
  }
}

/** A transaction that is not READ COMMITTED would read stale totals after its locks. */
export class IsolationViolation extends Error {
  constructor(level: string) {
    super(`accounting transactions require READ COMMITTED, got ${level}`);
    this.name = 'IsolationViolation';
  }
}

/** Statement parameters, or a function evaluated just before the statement is sent. */
export type Params = readonly unknown[] | (() => readonly unknown[]);

export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: Params,
  ): Promise<pg.QueryResult<R>>;
  /** One transaction-level advisory lock, in its own statement. */
  lock(key: bigint, mode: 'shared' | 'exclusive'): Promise<void>;
  /** The policy lock first: shared for accounting, exclusive for operator mutations. */
  policy(mode: 'shared' | 'exclusive'): Promise<void>;
  /** Lowers the transaction's deadline for every later wait, COMMIT included; never raises it. */
  clamp(deadline: Deadline): void;
}

const TIMEOUT_CODES = new Set(['55P03', '57014']);

/** The finalizer window guard of migration 0006: a live outcome outside its window. */
export const WINDOW_GUARD_CODE = 'LT001';

/**
 * SQLSTATEs that, answered to COMMIT at ERROR severity, mean the server aborted the transaction:
 * serialization/deadlock aborts, deferred integrity violations and the window guard. Everything
 * else (connection failure 08xxx, transaction resolution unknown 08007, shutdown 57P0x, internal
 * XXxxx, statement completion unknown 40003, FATAL/PANIC severity, a missing or localized
 * severity) leaves the commit unknown: a positive list, never a SQLSTATE pattern.
 */
const DEFINITE_ROLLBACK_CODES: ReadonlySet<string> = new Set([
  '40000',
  '40001',
  '40002',
  '40P01',
  '23502',
  '23503',
  '23505',
  '23514',
  '23P01',
  WINDOW_GUARD_CODE,
]);

const definiteRollback = (error: unknown): boolean => {
  const { code, severity } = (error ?? {}) as { code?: unknown; severity?: unknown };
  return severity === 'ERROR' && typeof code === 'string' && DEFINITE_ROLLBACK_CODES.has(code);
};

function classify(error: unknown): Error {
  if (
    error instanceof StorageUnavailable ||
    error instanceof IsolationViolation ||
    error instanceof AccountingRejection
  ) {
    return error;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === WINDOW_GUARD_CODE) return new AccountingRejection('WINDOW_CLOSED');
  if (code === '23505') return new AccountingRejection('DUPLICATE', 'record already exists');
  if (code === '23503')
    return new AccountingRejection('UNKNOWN_REFERENCE', 'referenced record missing');
  if (code === '23514') return new AccountingRejection('CONSTRAINT', 'value not allowed');
  const reason = typeof code === 'string' && TIMEOUT_CODES.has(code) ? 'timeout' : 'failure';
  return new StorageUnavailable(reason, { cause: error });
}

/**
 * Checks out a client within the deadline. A client that arrives after the deadline is released
 * at once, without running anything.
 */
export async function checkout(pool: pg.Pool, deadline: Deadline): Promise<pg.PoolClient> {
  const remaining = remainingMs(deadline);
  if (remaining <= 0) throw new StorageUnavailable('timeout');
  let timer: NodeJS.Timeout | undefined;
  const state = { late: false };
  const pending = pool.connect();
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      state.late = true;
      reject(new StorageUnavailable('timeout'));
    }, Math.ceil(remaining));
  });
  try {
    const client = await Promise.race([pending, timeout]);
    if (expired(deadline)) {
      client.release();
      throw new StorageUnavailable('timeout');
    }
    return client;
  } catch (error) {
    if (state.late) {
      pending.then(
        (client) => {
          client.release();
        },
        () => undefined,
      );
    }
    throw classify(error);
  } finally {
    clearTimeout(timer);
  }
}

const requireReadCommitted = (rows: readonly { transaction_isolation?: string }[]): void => {
  const level = rows[0]?.transaction_isolation ?? 'unknown';
  if (level !== 'read committed') throw new IsolationViolation(level);
};

export async function assertReadCommitted(client: pg.ClientBase): Promise<void> {
  const { rows } = await client.query<{ transaction_isolation: string }>(
    'SHOW transaction_isolation',
  );
  requireReadCommitted(rows);
}

/** One client under one absolute deadline; counts statements actually sent. */
class BoundedClient {
  readonly #client: pg.PoolClient;
  #deadline: Deadline;
  #sent = 0;

  constructor(client: pg.PoolClient, deadline: Deadline) {
    this.#client = client;
    this.#deadline = deadline;
  }

  get sent(): number {
    return this.#sent;
  }

  remaining(): number {
    return remainingMs(this.#deadline);
  }

  clamp(deadline: Deadline): void {
    if (deadline.atMs < this.#deadline.atMs) this.#deadline = deadline;
  }

  /** Rechecks the time, evaluates the parameters, sends, and waits no later than the deadline. */
  async run<R extends pg.QueryResultRow>(sql: string, params?: Params): Promise<pg.QueryResult<R>> {
    const remaining = this.remaining();
    if (remaining <= 0) throw new StorageUnavailable('timeout');
    const values = typeof params === 'function' ? params() : params;
    this.#sent += 1;
    const sent = this.#client.query<R>(sql, values as unknown[] | undefined);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new StorageUnavailable('timeout'));
      }, Math.ceil(remaining));
    });
    try {
      return await Promise.race([sent, timeout]);
    } catch (error) {
      // An abandoned statement may still settle; its result is no longer wanted.
      sent.catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function boundedTx(client: BoundedClient): Tx {
  const query: Tx['query'] = async (sql, params) => {
    await client.run(
      "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)",
      () => [String(Math.max(1, Math.ceil(client.remaining())))],
    );
    // `run` rechecks the time after that wait, immediately before sending.
    return client.run(sql, params);
  };
  const lock: Tx['lock'] = async (key, mode) => {
    const fn = mode === 'shared' ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock';
    await query(`SELECT ${fn}($1::bigint)`, [key.toString()]);
  };
  return {
    query,
    lock,
    policy: (mode) => lock(POLICY_LOCK_KEY, mode),
    clamp: (deadline) => {
      client.clamp(deadline);
    },
  };
}

async function commit(client: BoundedClient): Promise<void> {
  const before = client.sent;
  try {
    await client.run('COMMIT');
  } catch (error) {
    // Not sent, or a definite server abort: nothing committed. Anything else: unknown.
    if (client.sent === before || definiteRollback(error)) throw error;
    const reason = error instanceof StorageUnavailable ? error.reason : 'failure';
    throw new StorageUnavailable(reason, { cause: error, commitUnknown: true });
  }
}

/**
 * Runs `work` in one READ COMMITTED transaction on one checked-out client, bounded by `deadline`.
 * On any failure the connection is destroyed without waiting for a ROLLBACK.
 */
export async function readCommitted<T>(
  pool: pg.Pool,
  deadline: Deadline,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const raw = await checkout(pool, deadline);
  const client = new BoundedClient(raw, deadline);
  let failure: Error | undefined;
  try {
    await client.run('BEGIN ISOLATION LEVEL READ COMMITTED');
    requireReadCommitted(
      (await client.run<{ transaction_isolation: string }>('SHOW transaction_isolation')).rows,
    );
    const result = await work(boundedTx(client));
    await commit(client);
    return result;
  } catch (error) {
    failure = classify(error);
    throw failure;
  } finally {
    raw.release(failure);
  }
}
