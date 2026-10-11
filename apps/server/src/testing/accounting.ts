import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { deadlineIn } from '../ai/accounting/deadline.ts';
import { OperatorStore, type ApprovalCeilings } from '../ai/accounting/operator-store.ts';
import { startRequest } from '../ai/accounting/request-journal.ts';
import type { Queryable } from '../ai/accounting/spend.ts';
import type { Resolve } from '../ai/accounting/stop-scope.ts';
import type { AccountingSession, AdmissionRequest, Authorization } from '../ai/accounting/types.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from './throwaway-database.ts';

/**
 * Integration-test support for the accounting store (excluded from builds). Every test gets its
 * own migrated throwaway database; operator records here are test fixtures in that database only,
 * never in the development campaign database and never an owner authorization.
 */
export const TEST_AUTH: Authorization = {
  ownerId: 'test-owner',
  authorizedOn: '2026-10-11',
  source: 'integration-test-fixture',
};

export interface AccountingDb {
  readonly database: ThrowawayDatabase;
  readonly pool: pg.Pool;
  readonly operator: OperatorStore;
  /** An extra pool for competing "processes". */
  pool2(): pg.Pool;
  close(): Promise<void>;
}

export async function accountingDb(): Promise<AccountingDb> {
  const database = await createThrowawayDatabase({ migrate: true });
  const pool = new pg.Pool({ connectionString: database.url, max: 6 });
  const extra: pg.Pool[] = [];
  return {
    database,
    pool,
    operator: new OperatorStore(pool),
    pool2: () => {
      const other = new pg.Pool({ connectionString: database.url, max: 6 });
      extra.push(other);
      return other;
    },
    close: async () => {
      await Promise.all([pool, ...extra].map((p) => p.end()));
      await database.drop();
    },
  };
}

export const CEILINGS: ApprovalCeilings = {
  stageMicros: 1_000_000n,
  campaignDailyMicros: 1_000_000n,
  playSessionMicros: 1_000_000n,
  evaluationRunMicros: 1_000_000n,
};

/** One billing account and one approval for `ravenford`, unless told otherwise. */
export async function seedApproval(
  db: AccountingDb,
  options: {
    accountId?: string;
    approvalId?: string;
    globalDailyMicros?: bigint;
    ceilings?: Partial<ApprovalCeilings>;
    campaignIds?: string[];
    createAccount?: boolean;
  } = {},
): Promise<{ accountId: string; approvalId: string }> {
  const accountId = options.accountId ?? 'acct';
  const approvalId = options.approvalId ?? `approval-${randomUUID().slice(0, 8)}`;
  if (options.createAccount !== false) {
    await db.operator.createAccount({
      accountId,
      providerAccountRef: `ref-${accountId}`,
      globalDailyCeilingMicros: options.globalDailyMicros ?? 1_000_000n,
      authorization: TEST_AUTH,
    });
  }
  await db.operator.createApproval({
    approvalId,
    accountId,
    grantReference: `grant-${approvalId}`,
    stage: '300',
    ceilings: { ...CEILINGS, ...options.ceilings },
    campaignIds: options.campaignIds ?? ['ravenford'],
    authorization: TEST_AUTH,
  });
  return { accountId, approvalId };
}

/** A durable request start with a generous deadline; returns its ID. */
export async function startedRequest(
  pool: pg.Pool,
  approvalId: string | null,
  session: AccountingSession | null = { class: 'play', sessionId: 'session-1' },
  campaignId = 'ravenford',
): Promise<string> {
  const requestId = randomUUID();
  const started = await startRequest(
    pool,
    {
      requestId,
      campaignId,
      actorId: 'dm-ravenford',
      purpose: 'dm-intent',
      capability: 'reasoning',
      scope: 'PUBLIC',
      sourceIds: [],
      approvalId,
      session,
      configuredModel: 'claude-opus-5-5',
    },
    deadlineIn(60_000),
  );
  if (started.status !== 'started') throw new Error(`request start failed: ${started.reason}`);
  return requestId;
}

export const admission = (
  requestId: string,
  reserveMicros: bigint,
  overrides: Partial<AdmissionRequest> = {},
): AdmissionRequest => ({
  requestId,
  attemptId: randomUUID(),
  attemptKind: 'initial',
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  pricingVersion: 'test-pricing-1',
  reserveMicros,
  ...overrides,
});

/** An attempt admitted `daysAgo` UTC days earlier, as a process running then stored it. */
export async function attemptOnEarlierDay(
  pool: pg.Pool,
  approvalId: string,
  micros: bigint,
  options: { daysAgo?: number; sessionId?: string } = {},
): Promise<string> {
  const sessionId = options.sessionId ?? 'session-1';
  const requestId = await startedRequest(pool, approvalId, { class: 'play', sessionId });
  const attemptId = randomUUID();
  await pool.query(
    `INSERT INTO ltw_ai_attempts (attempt_id, request_id, account_id, approval_id, campaign_id,
       session_class, session_id, billing_day, capability, attempt_kind, provider, model,
       pricing_version, reserved_micros)
     SELECT $1, $2, ap.account_id, ap.approval_id, 'ravenford', 'play', $6,
       (clock_timestamp() AT TIME ZONE 'UTC')::date - $4::int, 'reasoning', 'initial',
       'anthropic', 'claude-opus-5-5', 'test-pricing-1', $3::bigint
     FROM ltw_ai_approvals ap WHERE ap.approval_id = $5`,
    [attemptId, requestId, micros.toString(), options.daysAgo ?? 1, approvalId, sessionId],
  );
  return attemptId;
}

/** Holds a session-level advisory lock on its own connection until `release`. */
export async function holdLock(
  url: string,
  key: bigint,
  mode: 'shared' | 'exclusive' = 'exclusive',
): Promise<{ release(): Promise<void> }> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const fn = mode === 'shared' ? 'pg_advisory_lock_shared' : 'pg_advisory_lock';
  await client.query(`SELECT ${fn}($1::bigint)`, [key.toString()]);
  return { release: () => client.end() };
}

/** Waits until at least `count` advisory lock requests in this database are blocked. */
export async function advisoryWaiters(
  pool: pg.Pool,
  count: number,
  mode?: 'ShareLock' | 'ExclusiveLock',
): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_locks
       WHERE locktype = 'advisory' AND NOT granted AND database = (
         SELECT oid FROM pg_database WHERE datname = current_database())
         AND ($1::text IS NULL OR mode = $1)`,
      [mode ?? null],
    );
    if ((rows[0]?.n ?? 0) >= count) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`expected ${String(count)} blocked advisory lock requests`);
}

/** Today's UTC day as this database reports it. */
export async function databaseDay(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ day: string }>(
    `SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day`,
  );
  return rows[0]?.day ?? '';
}

/** A raw client in the `query` shape the spend readers take (for isolation controls). */
export const asQueryable = (client: pg.ClientBase): Queryable => ({
  query: (sql: string, params?: readonly unknown[]) => client.query(sql, params as unknown[]),
});

/**
 * A pool on a real database whose clients answer statements matching `match` `ms` late (the statement itself runs at once), recording every statement they are sent
 * (delayed-response controls, Sol P1/P2).
 */
export function delayedResponsePool(
  url: string,
  match: RegExp,
  ms: number,
): { pool: pg.Pool; sent: string[] } {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const sent: string[] = [];
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    (client as unknown as { query: unknown }).query = async (...args: unknown[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : '';
      sent.push(sql);
      const result = await query(...args);
      if (match.test(sql)) await new Promise((done) => setTimeout(done, ms));
      return result;
    };
  });
  return { pool, sent };
}

/**
 * A pool on a real database whose clients really execute `execute` when sent COMMIT, then answer
 * with `error` instead of the server's reply: an ambiguous answer after a real commit, or a
 * definite abort after a real rollback (commit-uncertainty controls).
 */
export function answeredCommitPool(
  url: string,
  execute: 'COMMIT' | 'ROLLBACK',
  error: Readonly<Record<string, string>>,
): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    (client as unknown as { query: unknown }).query = async (...args: unknown[]) => {
      if (args[0] !== 'COMMIT') return query(...args);
      await query(execute);
      throw Object.assign(new Error('answered by test'), error);
    };
  });
  return pool;
}

/**
 * A test-only identity resolver: every recorded `(provider, model)` is its own verified canonical
 * model. Production resolves through the verified catalog (`ai/catalog.ts`); stop-scope tests use
 * explicit alias registries instead.
 */
export const TEST_RESOLVE: Resolve = (_provider, model) => model;
