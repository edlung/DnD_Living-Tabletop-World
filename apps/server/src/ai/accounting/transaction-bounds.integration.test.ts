import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TEST_AUTH,
  admission,
  accountingDb,
  answeredCommitPool,
  advisoryWaiters,
  databaseDay,
  delayedResponsePool,
  holdLock,
  seedApproval,
  startedRequest,
  type AccountingDb,
  TEST_RESOLVE,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { POLICY_LOCK_KEY, bucketLockKey } from './lock-keys.ts';
import { StorageUnavailable, readCommitted } from './pg-transaction.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import { startRequest } from './request-journal.ts';

/**
 * Bounded storage (docs/STAGE_300_REMEDIATION_DESIGN.md §1): pool checkout, lock waits and
 * statements share one positive deadline; an expired deadline starts no database work; a late
 * client is released untouched; the operator's exclusive policy lock excludes accounting.
 */
let db: AccountingDb;
let approvalId: string;
beforeEach(async () => {
  db = await accountingDb();
  ({ approvalId } = await seedApproval(db));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
});

const attempts = async () =>
  Number(
    (await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM ltw_ai_attempts')).rows[0]?.n,
  );
const globalDayKey = async () =>
  bucketLockKey({ kind: 'global-day', accountId: 'acct', day: await databaseDay(db.pool) });

describe('deadlines on locks, statements and checkout', () => {
  it('denies as unavailable when a lock outlasts the 5 s storage step', async () => {
    const requestId = await startedRequest(db.pool, approvalId);
    const held = await holdLock(db.database.url, await globalDayKey());
    const started = performance.now();
    try {
      const result = await new PostgresBudgetStore(db.pool, TEST_RESOLVE).admit(
        admission(requestId, 1n),
        deadlineIn(8_000),
      );
      expect(result).toEqual({
        status: 'denied',
        code: 'ADMISSION_UNAVAILABLE',
        detail: 'STORAGE',
      });
    } finally {
      await held.release();
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThan(4_500);
    expect(elapsed).toBeLessThan(6_500);
    expect(await attempts()).toBe(0);
  });

  it('cancels at the request deadline while waiting on a lock, admitting nothing', async () => {
    const requestId = await startedRequest(db.pool, approvalId);
    const held = await holdLock(db.database.url, await globalDayKey());
    const started = performance.now();
    try {
      const result = await new PostgresBudgetStore(db.pool, TEST_RESOLVE).admit(
        admission(requestId, 1n),
        deadlineIn(300),
      );
      expect(result).toMatchObject({ code: 'CALLER_CANCELLED' });
    } finally {
      await held.release();
    }
    expect(performance.now() - started).toBeLessThan(1_500);
    expect(await attempts()).toBe(0);
  });

  it('starts no database work once the deadline has passed', async () => {
    const pool = db.pool2();
    const connect = vi.spyOn(pool, 'connect');
    const store = new PostgresBudgetStore(pool, TEST_RESOLVE);
    const gone = deadlineIn(-1);
    expect(
      await store.admit(admission('00000000-0000-4000-8000-000000000001', 1n), gone),
    ).toMatchObject({
      code: 'CALLER_CANCELLED',
    });
    const start = await startRequest(
      pool,
      {
        requestId: '00000000-0000-4000-8000-000000000002',
        campaignId: 'ravenford',
        actorId: 'dm',
        purpose: 'dm-intent',
        capability: 'reasoning',
        scope: 'PUBLIC',
        sourceIds: [],
        approvalId: null,
        session: null,
        configuredModel: null,
      },
      gone,
    );
    expect(start).toEqual({ status: 'failed', reason: 'CALLER_CANCELLED' });
    await expect(readCommitted(pool, gone, () => Promise.resolve(1))).rejects.toThrow(
      StorageUnavailable,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('never sends application SQL after a delayed settings response (real PostgreSQL)', async () => {
    const requestId = await startedRequest(db.pool, approvalId);
    const { pool, sent } = delayedResponsePool(db.database.url, /set_config/, 1_000);
    const started = performance.now();
    try {
      const result = await new PostgresBudgetStore(pool, TEST_RESOLVE).admit(
        admission(requestId, 1n),
        deadlineIn(300),
      );
      expect(result).toMatchObject({ status: 'denied', code: 'CALLER_CANCELLED' });
      expect(performance.now() - started).toBeLessThan(800);
      await new Promise((done) => setTimeout(done, 1_000));
      expect(sent.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(false);
      expect(sent).not.toContain('COMMIT');
    } finally {
      await pool.end();
    }
    expect(await attempts()).toBe(0);
  });

  it('reports an unconfirmed COMMIT as unknown and never treats its hold as absent', async () => {
    const { approvalId: tight } = await seedApproval(db, {
      approvalId: 'tight',
      createAccount: false,
      ceilings: { playSessionMicros: 100n },
    });
    const requestId = await startedRequest(db.pool, tight);
    // The server commits at once; only its answer is late.
    const { pool } = delayedResponsePool(db.database.url, /^COMMIT$/, 3_000);
    const started = performance.now();
    try {
      const result = await new PostgresBudgetStore(pool, TEST_RESOLVE).admit(
        admission(requestId, 100n),
        deadlineIn(1_200),
      );
      expect(result).toEqual({
        status: 'denied',
        code: 'CALLER_CANCELLED',
        detail: 'COMMIT_UNKNOWN',
      });
      expect(performance.now() - started).toBeLessThan(2_500);
    } finally {
      await pool.end();
    }
    // The hold did commit, and it still counts: nothing was refunded.
    expect(await attempts()).toBe(1);
    const again = await new PostgresBudgetStore(db.pool, TEST_RESOLVE).admit(
      admission(await startedRequest(db.pool, tight), 1n),
      deadlineIn(10_000),
    );
    expect(again).toEqual({ status: 'denied', code: 'BUDGET_DENIED', detail: 'SESSION' });
  });

  it.each([
    { code: '08007', severity: 'FATAL' },
    { code: '08006', severity: 'FATAL' },
    { code: '57P01', severity: 'FATAL' },
    { code: 'XX000', severity: 'ERROR' },
  ])(
    'keeps a committed hold after an ambiguous COMMIT answer ($code) as COMMIT_UNKNOWN',
    async (answer) => {
      const { approvalId: tight } = await seedApproval(db, {
        approvalId: `tight-${answer.code}`,
        createAccount: false,
        ceilings: { playSessionMicros: 100n },
      });
      const pool = answeredCommitPool(db.database.url, 'COMMIT', answer);
      try {
        const result = await new PostgresBudgetStore(pool, TEST_RESOLVE).admit(
          admission(await startedRequest(db.pool, tight), 100n),
          deadlineIn(5_000),
        );
        expect(result).toEqual({
          status: 'denied',
          code: 'ADMISSION_UNAVAILABLE',
          detail: 'COMMIT_UNKNOWN',
        });
      } finally {
        await pool.end();
      }
      expect(await attempts()).toBe(1);
      const again = await new PostgresBudgetStore(db.pool, TEST_RESOLVE).admit(
        admission(await startedRequest(db.pool, tight), 1n),
        deadlineIn(10_000),
      );
      expect(again).toEqual({ status: 'denied', code: 'BUDGET_DENIED', detail: 'SESSION' });
    },
  );

  it('reports a definite abort (40001 at ERROR) as storage failure with nothing held', async () => {
    const pool = answeredCommitPool(db.database.url, 'ROLLBACK', {
      code: '40001',
      severity: 'ERROR',
    });
    try {
      const result = await new PostgresBudgetStore(pool, TEST_RESOLVE).admit(
        admission(await startedRequest(db.pool, approvalId), 100n),
        deadlineIn(5_000),
      );
      expect(result).toEqual({
        status: 'denied',
        code: 'ADMISSION_UNAVAILABLE',
        detail: 'STORAGE',
      });
    } finally {
      await pool.end();
    }
    expect(await attempts()).toBe(0);
  });

  it('releases a client that arrives after the deadline without running anything', async () => {
    const pool = new pg.Pool({ connectionString: db.database.url, max: 1 });
    const holder = await pool.connect();
    const lateQueries: string[] = [];
    pool.on('acquire', (client) => {
      const query = client.query.bind(client) as (...args: unknown[]) => unknown;
      (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
        lateQueries.push(String(args[0]));
        return query(...args);
      };
    });
    try {
      const result = await new PostgresBudgetStore(pool, TEST_RESOLVE).admit(
        admission(await startedRequest(db.pool, approvalId), 1n),
        deadlineIn(200),
      );
      expect(result).toMatchObject({ code: 'CALLER_CANCELLED' });
      holder.release();
      for (let tries = 0; tries < 40 && pool.idleCount < 1; tries += 1) {
        await new Promise((done) => setTimeout(done, 25));
      }
      expect(pool.idleCount).toBe(1);
      expect(lateQueries).toEqual([]);
      expect(await attempts()).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('denies as unavailable when the database cannot be reached', async () => {
    const url = new URL(db.database.url);
    url.port = '1';
    const unreachable = new pg.Pool({ connectionString: url.toString() });
    try {
      const result = await new PostgresBudgetStore(unreachable, TEST_RESOLVE).admit(
        admission('00000000-0000-4000-8000-000000000003', 1n),
        deadlineIn(3_000),
      );
      expect(result).toEqual({
        status: 'denied',
        code: 'ADMISSION_UNAVAILABLE',
        detail: 'STORAGE',
      });
    } finally {
      await unreachable.end();
    }
  });

  it('sets positive transaction-local timeouts and stops a slow statement', async () => {
    const pool = new pg.Pool({ connectionString: db.database.url, max: 1 });
    try {
      const settings = await readCommitted(pool, deadlineIn(2_000), async (tx) => {
        const { rows } = await tx.query<{ statement: string; lock: string }>(
          `SELECT current_setting('statement_timeout') AS statement,
             current_setting('lock_timeout') AS lock`,
        );
        return rows[0];
      });
      const ms = (value = '') => Number(value.replace(/ms$/, '').replace(/s$/, '000'));
      expect(ms(settings?.statement)).toBeGreaterThan(0);
      expect(ms(settings?.statement)).toBeLessThanOrEqual(2_000);
      expect(ms(settings?.lock)).toBeGreaterThan(0);
      // Local to that transaction: the pooled connection is back to its defaults.
      const after = await pool.query<{ s: string }>(
        `SELECT current_setting('statement_timeout') AS s`,
      );
      expect(after.rows[0]?.s).toBe('0');

      const started = performance.now();
      await expect(
        readCommitted(pool, deadlineIn(250), (tx) => tx.query('SELECT pg_sleep(2)')),
      ).rejects.toMatchObject({ reason: 'timeout' });
      expect(performance.now() - started).toBeLessThan(1_500);
    } finally {
      await pool.end();
    }
  });
});

describe('the policy lock', () => {
  it('makes an operator mutation wait for accounting, and accounting wait for it', async () => {
    const shared = await holdLock(db.database.url, POLICY_LOCK_KEY, 'shared');
    const revised = db.operator.reviseAccount({
      accountId: 'acct',
      globalDailyCeilingMicros: 2_000_000n,
      authorization: TEST_AUTH,
    });
    await advisoryWaiters(db.pool, 1, 'ExclusiveLock');
    await shared.release();
    expect(await revised).toBe(2);

    const exclusive = await holdLock(db.database.url, POLICY_LOCK_KEY, 'exclusive');
    const admitted = new PostgresBudgetStore(db.pool, TEST_RESOLVE).admit(
      admission(await startedRequest(db.pool, approvalId), 1n),
      deadlineIn(10_000),
    );
    await advisoryWaiters(db.pool, 1, 'ShareLock');
    await exclusive.release();
    expect((await admitted).status).toBe('admitted');
  });
});
