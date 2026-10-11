import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  admission,
  accountingDb,
  asQueryable,
  advisoryWaiters,
  databaseDay,
  holdLock,
  seedApproval,
  startedRequest,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { scopeBuckets, sortedLockKeys, type AttemptScope } from './lock-keys.ts';
import { IsolationViolation, assertReadCommitted } from './pg-transaction.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import { readBucketSpend } from './spend.ts';

/**
 * Admission under real PostgreSQL concurrency (docs/STAGE_300_REMEDIATION_DESIGN.md §1): two
 * connections forced onto the same remaining capacity, the REPEATABLE READ negative control, and
 * a restart. Each test has its own migrated throwaway database.
 */
let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});

const attempts = async (pool: pg.Pool) =>
  Number((await pool.query<{ n: string }>('SELECT count(*) AS n FROM ltw_ai_attempts')).rows[0]?.n);

const scopeOf = async (accountId: string, approvalId: string): Promise<AttemptScope> => ({
  accountId,
  approvalId,
  campaignId: 'ravenford',
  sessionClass: 'play',
  sessionId: 'session-1',
  day: await databaseDay(db.pool),
});

describe('admission competing for the same capacity', () => {
  it('admits exactly one of two processes; the waiter sees the committed hold', async () => {
    const { accountId, approvalId } = await seedApproval(db, {
      ceilings: { playSessionMicros: 1_000n },
    });
    const [first, second] = [
      await startedRequest(db.pool, approvalId),
      await startedRequest(db.pool, approvalId),
    ];
    // Barrier: both admissions block on the first lock of their identical sorted set.
    const [lowest] = sortedLockKeys(scopeBuckets(await scopeOf(accountId, approvalId)));
    const barrier = await holdLock(db.database.url, lowest ?? 0n);
    const processA = new PostgresBudgetStore(db.pool);
    const processB = new PostgresBudgetStore(db.pool2());
    const results = Promise.all([
      processA.admit(admission(first, 600n), deadlineIn(10_000)),
      processB.admit(admission(second, 600n), deadlineIn(10_000)),
    ]);
    await advisoryWaiters(db.pool, 2);
    await barrier.release();

    const statuses = (await results).map((result) =>
      result.status === 'admitted' ? 'admitted' : `${result.code}:${result.detail}`,
    );
    expect(statuses.sort()).toEqual(['BUDGET_DENIED:SESSION', 'admitted']);
    expect(await attempts(db.pool)).toBe(1);
  });

  it('negative control: a REPEATABLE READ snapshot misses the hold, and is refused', async () => {
    const { accountId, approvalId } = await seedApproval(db, {
      ceilings: { playSessionMicros: 1_000n },
    });
    const scope = await scopeOf(accountId, approvalId);
    const stale = new pg.Client({ connectionString: db.database.url });
    await stale.connect();
    try {
      await stale.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await stale.query('SELECT pg_advisory_xact_lock_shared(-1)');
      const store = new PostgresBudgetStore(db.pool);
      const admitted = await store.admit(
        admission(await startedRequest(db.pool, approvalId), 600n),
        deadlineIn(10_000),
      );
      expect(admitted.status).toBe('admitted');

      // The snapshot predates the commit: it would admit another 600 against a 1,000 ceiling.
      expect((await readBucketSpend(asQueryable(stale), scope)).session).toBe(0n);
      const fresh = await db.pool.connect();
      try {
        expect((await readBucketSpend(asQueryable(fresh), scope)).session).toBe(600n);
      } finally {
        fresh.release();
      }
      await expect(assertReadCommitted(stale)).rejects.toThrow(IsolationViolation);
    } finally {
      await stale.query('ROLLBACK');
      await stale.end();
    }
  });

  it('runs READ COMMITTED even when the database default is REPEATABLE READ', async () => {
    await db.pool.query(
      `ALTER DATABASE ${db.database.name} SET default_transaction_isolation = 'repeatable read'`,
    );
    const pool = db.pool2();
    const { approvalId } = await seedApproval(db, { ceilings: { playSessionMicros: 1_000n } });
    const store = new PostgresBudgetStore(pool);
    const one = await store.admit(
      admission(await startedRequest(pool, approvalId), 600n),
      deadlineIn(10_000),
    );
    const two = await store.admit(
      admission(await startedRequest(pool, approvalId), 600n),
      deadlineIn(10_000),
    );
    expect([one.status, two.status]).toEqual(['admitted', 'denied']);
  });
});

describe('durability', () => {
  it('keeps holds across a restart and across processes', async () => {
    const { approvalId } = await seedApproval(db, { ceilings: { playSessionMicros: 1_000n } });
    const before = new pg.Pool({ connectionString: db.database.url });
    const admitted = await new PostgresBudgetStore(before).admit(
      admission(await startedRequest(before, approvalId), 900n),
      deadlineIn(10_000),
    );
    expect(admitted.status).toBe('admitted');
    await before.end();

    const after = new PostgresBudgetStore(db.pool2());
    const denied = await after.admit(
      admission(await startedRequest(db.pool, approvalId), 200n),
      deadlineIn(10_000),
    );
    expect(denied).toEqual({ status: 'denied', code: 'BUDGET_DENIED', detail: 'SESSION' });
    const fits = await after.admit(
      admission(await startedRequest(db.pool, approvalId), 100n),
      deadlineIn(10_000),
    );
    expect(fits.status).toBe('admitted');
  });

  it('persists the attempt with its scope, billing day, pricing version and bound', async () => {
    const { accountId, approvalId } = await seedApproval(db);
    const requestId = await startedRequest(db.pool, approvalId, {
      class: 'play',
      sessionId: 's-9',
    });
    const request = admission(requestId, 1_234n, { attemptKind: 'repair', pricingVersion: 'p-7' });
    const result = await new PostgresBudgetStore(db.pool).admit(request, deadlineIn(10_000));
    expect(result).toMatchObject({ status: 'admitted', reservedMicros: 1_234n });
    const { rows } = await db.pool.query(
      `SELECT request_id, account_id, approval_id, campaign_id, session_class, session_id,
         to_char(billing_day, 'YYYY-MM-DD') AS day, attempt_kind, pricing_version,
         reserved_micros::text AS reserved FROM ltw_ai_attempts`,
    );
    expect(rows).toEqual([
      {
        request_id: requestId,
        account_id: accountId,
        approval_id: approvalId,
        campaign_id: 'ravenford',
        session_class: 'play',
        session_id: 's-9',
        day: await databaseDay(db.pool),
        attempt_kind: 'repair',
        pricing_version: 'p-7',
        reserved: '1234',
      },
    ]);
  });
});
