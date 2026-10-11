import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  admission,
  accountingDb,
  delayedResponsePool,
  seedApproval,
  startedRequest,
  type AccountingDb,
  TEST_RESOLVE,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { PostgresBudgetStore, accountingStatus } from './postgres-budget-store.ts';
import { recoverIncomplete } from './recovery.ts';
import {
  finalize,
  recoverRequest,
  startRequest,
  traceDigest,
  type FinalOutcome,
} from './request-journal.ts';

/**
 * Request starts, unique caller outcomes and recovery (docs/STAGE_300_REMEDIATION_DESIGN.md §2),
 * as primitives: use cases connect to them at checkpoint B2.
 */
let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
});

const START = {
  campaignId: 'ravenford',
  actorId: 'dm-ravenford',
  purpose: 'relevance',
  capability: 'fast-context',
  scope: 'PLAYER',
  sourceIds: ['mira-vale'],
  approvalId: null,
  session: null,
  configuredModel: null,
};
const storedWindowMs = async (requestId: string) =>
  Number(
    (
      await db.pool.query<{ ms: string }>(
        `SELECT extract(epoch FROM deadline_at - created_at) * 1000 AS ms
         FROM ltw_ai_requests WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0]?.ms,
  );
/** A request whose finalizer window closed `ago` seconds past its deadline plus 5 s. */
async function pastRequest(ago = 1): Promise<string> {
  const requestId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_ai_requests (request_id, campaign_id, actor_id, purpose, capability, scope,
       source_ids, deadline_at)
     VALUES ($1, 'ravenford', 'dm-ravenford', 'dm-intent', 'reasoning', 'PUBLIC', '[]',
       clock_timestamp() - make_interval(secs => 5 + $2))`,
    [requestId, ago],
  );
  return requestId;
}
const outcome = (requestId: string, text = 'trace body'): FinalOutcome => {
  const traceJson = JSON.stringify({ traceId: requestId, text, z: 1, a: 2 });
  return {
    requestId,
    status: 'RANKED',
    provider: 'local',
    code: null,
    traceJson,
    trace: {
      campaignId: 'ravenford',
      actorId: 'dm-ravenford',
      purpose: 'relevance',
      createdAt: '2026-10-11T00:00:00.000Z',
    },
  };
};
const rows = async (table: string) =>
  (await db.pool.query(`SELECT * FROM ${table}`)).rows as Record<string, unknown>[];

describe('request start', () => {
  it('stores the database deadline from monotonic time, whatever the wall clock says', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2035, 0, 1));
    const requestId = randomUUID();
    expect(await startRequest(db.pool, { ...START, requestId }, deadlineIn(30_000))).toEqual({
      status: 'started',
    });
    const ms = await storedWindowMs(requestId);
    expect(ms).toBeGreaterThan(29_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it('subtracts a delayed checkout from the stored deadline', async () => {
    const pool = new pg.Pool({ connectionString: db.database.url, max: 1 });
    const holder = await pool.connect();
    setTimeout(() => {
      holder.release();
    }, 600);
    try {
      const requestId = randomUUID();
      expect(await startRequest(pool, { ...START, requestId }, deadlineIn(3_000))).toEqual({
        status: 'started',
      });
      const ms = await storedWindowMs(requestId);
      expect(ms).toBeGreaterThan(1_500);
      expect(ms).toBeLessThan(2_500);
    } finally {
      await pool.end();
    }
  });

  it('subtracts delayed timeout settings: remaining time is taken as the INSERT is issued', async () => {
    const { pool } = delayedResponsePool(db.database.url, /set_config/, 250);
    try {
      const requestId = randomUUID();
      expect(await startRequest(pool, { ...START, requestId }, deadlineIn(2_000))).toEqual({
        status: 'started',
      });
      const ms = await storedWindowMs(requestId);
      // The caller had at most 2,000 - 250 ms left when the INSERT was sent.
      expect(ms).toBeLessThanOrEqual(1_750);
      expect(ms).toBeGreaterThan(1_000);
    } finally {
      await pool.end();
    }
  });
});

describe('caller outcome and trace', () => {
  it('records the outcome and the exact serialized trace together, once', async () => {
    const requestId = await startedRequest(db.pool, null, null);
    const final = outcome(requestId);
    expect(await finalize(db.pool, final, deadlineIn(5_000))).toBe('recorded');
    expect(await finalize(db.pool, final, deadlineIn(5_000))).toBe('duplicate');
    expect(await finalize(db.pool, outcome(requestId, 'different'), deadlineIn(5_000))).toBe(
      'conflict',
    );
    const [stored] = await rows('ltw_ai_request_outcomes');
    expect(stored).toMatchObject({
      kind: 'live',
      status: 'RANKED',
      trace_digest: traceDigest(final.traceJson),
    });
    const traces = await db.pool.query<{ trace: string }>(
      'SELECT trace::text AS trace FROM ltw_ai_traces WHERE trace_id = $1',
      [requestId],
    );
    expect(traces.rows).toHaveLength(1);
    expect(JSON.parse(traces.rows[0]?.trace ?? '')).toEqual(JSON.parse(final.traceJson));
    expect(await finalize(db.pool, outcome(randomUUID()), deadlineIn(5_000))).toBe(
      'unknown-request',
    );
  });

  it('rejects a live finalizer after its window, writing nothing', async () => {
    const requestId = await pastRequest();
    expect(await finalize(db.pool, outcome(requestId), deadlineIn(5_000))).toBe('window-closed');
    expect(await rows('ltw_ai_request_outcomes')).toEqual([]);
    expect(await rows('ltw_ai_traces')).toEqual([]);
  });
});

describe('recovery', () => {
  it('appends recovered_incomplete only after the window; a late finalizer then loses', async () => {
    const fresh = await startedRequest(db.pool, null, null);
    const stale = await pastRequest();
    expect(await recoverRequest(db.pool, fresh)).toBe('not-eligible');
    expect(await recoverRequest(db.pool, stale)).toBe('recovered');
    expect(await recoverRequest(db.pool, stale)).toBe('not-eligible');
    expect(await finalize(db.pool, outcome(stale), deadlineIn(5_000))).toBe('lost-to-recovery');
    expect(await rows('ltw_ai_traces')).toEqual([]);
    expect(await rows('ltw_ai_request_outcomes')).toMatchObject([
      { request_id: stale, kind: 'recovered_incomplete', status: null, trace_digest: null },
    ]);
  });

  it('lets only one of two concurrent recoveries win', async () => {
    const stale = await pastRequest();
    const results = await Promise.all([
      recoverRequest(db.pool, stale),
      recoverRequest(db.pool2(), stale),
    ]);
    expect(results.sort()).toEqual(['not-eligible', 'recovered']);
  });

  it('keeps holds; the sweep reports what it did', async () => {
    const { approvalId } = await seedApproval(db);
    const requestId = await startedRequest(db.pool, approvalId);
    const store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
    expect((await store.admit(admission(requestId, 100n), deadlineIn(10_000))).status).toBe(
      'admitted',
    );
    await pastRequest();
    expect(await recoverIncomplete(db.pool)).toEqual({
      recovered: 1,
      notEligible: 0,
      retryLater: 0,
    });
    expect(await accountingStatus(db.pool)).toMatchObject({ openHolds: 1, incompleteRequests: 1 });
  });

  it('runs a finalizer and a settlement of the same request without lock inversion', async () => {
    const { approvalId } = await seedApproval(db);
    const requestId = await startedRequest(db.pool, approvalId);
    const store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
    const admitted = await store.admit(admission(requestId, 100n), deadlineIn(10_000));
    if (admitted.status !== 'admitted') throw new Error('not admitted');
    const [finalized, settled] = await Promise.all([
      finalize(db.pool, outcome(requestId), deadlineIn(5_000)),
      new PostgresBudgetStore(db.pool2(), TEST_RESOLVE).settle({
        attemptId: admitted.attemptId,
        chargeMicros: 50n,
        usage: null,
        returnedModel: null,
        providerRequestId: null,
      }),
    ]);
    expect([finalized, settled]).toEqual(['recorded', 'settled']);
  });
});
