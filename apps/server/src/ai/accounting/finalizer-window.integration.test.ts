import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  accountingDb,
  advisoryWaiters,
  delayedResponsePool,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { requestLockKey } from './lock-keys.ts';
import { finalize, recoverRequest, type FinalOutcome } from './request-journal.ts';

/**
 * The finalizer's stored cutoff (docs/STAGE_300_REMEDIATION_DESIGN.md §2): a live caller outcome
 * and its trace commit only while database time is within the stored caller deadline plus
 * 5,000 ms, whatever deadline the caller passes and however late any answer arrives. Otherwise
 * nothing usable survives and recovery stays possible. Real PostgreSQL, throwaway databases.
 */
let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A request whose finalizer window (stored deadline + 5 s) closes `msLeft` from now. */
async function closingIn(msLeft: number): Promise<string> {
  const requestId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_ai_requests (request_id, campaign_id, actor_id, purpose, capability, scope,
       source_ids, deadline_at)
     VALUES ($1, 'ravenford', 'dm-ravenford', 'relevance', 'fast-context', 'PLAYER', '[]',
       clock_timestamp() + make_interval(secs => ($2::double precision - 5000) / 1000))`,
    [requestId, msLeft],
  );
  return requestId;
}

const outcomeOf = (requestId: string): FinalOutcome => ({
  requestId,
  status: 'RANKED',
  provider: 'local',
  traceJson: JSON.stringify({ traceId: requestId }),
  trace: {
    campaignId: 'ravenford',
    actorId: 'dm-ravenford',
    purpose: 'relevance',
    createdAt: '2026-10-11T00:00:00.000Z',
  },
});

const stored = async (requestId: string) => ({
  outcomes: (
    await db.pool.query<{ kind: string }>(
      'SELECT kind FROM ltw_ai_request_outcomes WHERE request_id = $1',
      [requestId],
    )
  ).rows.map((row) => row.kind),
  traces: (await db.pool.query('SELECT 1 FROM ltw_ai_traces WHERE trace_id = $1', [requestId]))
    .rowCount,
});

const WINDOW_READ = /FROM ltw_ai_requests r LEFT JOIN ltw_ai_request_outcomes/;

describe('finalize against its stored cutoff', () => {
  it('records nothing when the window closes while its window check is answered late', async () => {
    const requestId = await closingIn(300);
    const { pool } = delayedResponsePool(db.database.url, WINDOW_READ, 450);
    try {
      expect(await finalize(pool, outcomeOf(requestId), deadlineIn(5_000))).toBe('window-closed');
    } finally {
      await pool.end();
    }
    expect(await stored(requestId)).toEqual({ outcomes: [], traces: 0 });
    await sleep(100);
    expect(await recoverRequest(db.pool, requestId)).toBe('recovered');
  });

  it('records nothing when a write is answered after the window closes', async () => {
    const requestId = await closingIn(400);
    const { pool } = delayedResponsePool(
      db.database.url,
      /^\s*INSERT INTO ltw_ai_request_outcomes/,
      700,
    );
    try {
      expect(await finalize(pool, outcomeOf(requestId), deadlineIn(5_000))).toBe('window-closed');
    } finally {
      await pool.end();
    }
    expect(await stored(requestId)).toEqual({ outcomes: [], traces: 0 });
    await sleep(400);
    expect(await recoverRequest(db.pool, requestId)).toBe('recovered');
  });

  it('reports a COMMIT answered after the window as unknown, never as recorded', async () => {
    const requestId = await closingIn(400);
    const { pool } = delayedResponsePool(db.database.url, /^COMMIT$/, 1_000);
    const started = performance.now();
    try {
      await expect(finalize(pool, outcomeOf(requestId), deadlineIn(5_000))).rejects.toMatchObject({
        commitUnknown: true,
      });
      expect(performance.now() - started).toBeLessThan(900);
    } finally {
      await pool.end();
    }
    // It did commit inside the window, outcome and trace together; recovery defers to it.
    expect(await stored(requestId)).toEqual({ outcomes: ['live'], traces: 1 });
    await sleep(600);
    expect(await recoverRequest(db.pool, requestId)).toBe('not-eligible');
  });
});

describe('the database commit guard', () => {
  it('refuses to commit a live outcome and its trace once the window has closed', async () => {
    const requestId = await closingIn(300);
    const writer = new pg.Client({ connectionString: db.database.url });
    await writer.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(
        `INSERT INTO ltw_ai_request_outcomes (request_id, kind, status, trace_digest)
         VALUES ($1, 'live', 'RANKED', 'd')`,
        [requestId],
      );
      await writer.query(
        `INSERT INTO ltw_ai_traces (trace_id, campaign_id, actor_id, purpose, status, trace, created_at)
         VALUES ($1, 'ravenford', 'dm-ravenford', 'relevance', 'RANKED', '{}', now())`,
        [requestId],
      );
      await sleep(450);
      await expect(writer.query('COMMIT')).rejects.toMatchObject({ code: 'LT001' });
    } finally {
      await writer.end();
    }
    expect(await stored(requestId)).toEqual({ outcomes: [], traces: 0 });
    // Immediate constraint mode and autocommit do not bypass it; recovery is unaffected.
    await expect(
      db.pool.query(
        `INSERT INTO ltw_ai_request_outcomes (request_id, kind, status, trace_digest)
         VALUES ($1, 'live', 'RANKED', 'd')`,
        [requestId],
      ),
    ).rejects.toMatchObject({ code: 'LT001' });
    expect(await recoverRequest(db.pool, requestId)).toBe('recovered');
  });

  it('lets recovery win after a live writer holding the lock fails to commit late', async () => {
    const requestId = await closingIn(300);
    const writer = new pg.Client({ connectionString: db.database.url });
    await writer.connect();
    try {
      await writer.query('BEGIN');
      await writer.query('SELECT pg_advisory_xact_lock($1::bigint)', [
        requestLockKey(requestId).toString(),
      ]);
      await writer.query(
        `INSERT INTO ltw_ai_request_outcomes (request_id, kind, status, trace_digest)
         VALUES ($1, 'live', 'RANKED', 'd')`,
        [requestId],
      );
      await sleep(400);
      const recovery = recoverRequest(db.pool, requestId);
      await advisoryWaiters(db.pool, 1);
      await expect(writer.query('COMMIT')).rejects.toMatchObject({ code: 'LT001' });
      expect(await recovery).toBe('recovered');
    } finally {
      await writer.end();
    }
    expect(await stored(requestId)).toEqual({ outcomes: ['recovered_incomplete'], traces: 0 });
  });

  it('lets an in-window live writer holding the lock win; recovery defers to it', async () => {
    const requestId = await closingIn(1_500);
    const writer = new pg.Client({ connectionString: db.database.url });
    await writer.connect();
    try {
      await writer.query('BEGIN');
      await writer.query('SELECT pg_advisory_xact_lock($1::bigint)', [
        requestLockKey(requestId).toString(),
      ]);
      await writer.query(
        `INSERT INTO ltw_ai_request_outcomes (request_id, kind, status, trace_digest)
         VALUES ($1, 'live', 'RANKED', 'd')`,
        [requestId],
      );
      const recovery = recoverRequest(db.pool, requestId);
      await advisoryWaiters(db.pool, 1);
      await writer.query('COMMIT');
      expect(await recovery).toBe('not-eligible');
    } finally {
      await writer.end();
    }
    await sleep(1_600);
    expect(await recoverRequest(db.pool, requestId)).toBe('not-eligible');
    expect(await stored(requestId)).toEqual({ outcomes: ['live'], traces: 0 });
  });
});
