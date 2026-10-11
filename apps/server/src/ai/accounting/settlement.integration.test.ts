import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TEST_AUTH,
  admission,
  accountingDb,
  advisoryWaiters,
  asQueryable,
  attemptOnEarlierDay,
  holdLock,
  seedApproval,
  startedRequest,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { bucketLockKey } from './lock-keys.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import { readAttemptCharge } from './spend.ts';

/**
 * Settlement, release, evidence and automatic stops (docs/STAGE_300_REMEDIATION_DESIGN.md §1):
 * one terminal row per attempt, absolute non-reducing evidence, conservative open holds, stops in
 * the same transaction, and no deadlock between concurrent stopping settlements.
 */
let db: AccountingDb;
let store: PostgresBudgetStore;
let approvalId: string;
beforeEach(async () => {
  db = await accountingDb();
  store = new PostgresBudgetStore(db.pool);
  ({ approvalId } = await seedApproval(db, { ceilings: { playSessionMicros: 1_000n } }));
});
afterEach(async () => {
  await db.close();
});

async function admitted(micros: bigint, sessionId = 'session-1', model = 'claude-opus-5-5') {
  const requestId = await startedRequest(db.pool, approvalId, { class: 'play', sessionId });
  const result = await store.admit(admission(requestId, micros, { model }), deadlineIn(10_000));
  if (result.status !== 'admitted') throw new Error(`not admitted: ${result.code}`);
  return result.attemptId;
}
const charge = (attemptId: string, micros: bigint) =>
  store.settle({
    attemptId,
    chargeMicros: micros,
    usage: { inputTokens: 10, outputTokens: 5 },
    returnedModel: 'claude-opus-5-5',
    providerRequestId: 'msg_1',
  });
async function effective(attemptId: string) {
  const client = await db.pool.connect();
  try {
    return await readAttemptCharge(asQueryable(client), attemptId);
  } finally {
    client.release();
  }
}
const stops = async () =>
  (
    await db.pool.query<{ reason: string }>('SELECT reason FROM ltw_ai_stops ORDER BY created_at')
  ).rows.map((row) => row.reason);
const terminalRows = async (attemptId: string) =>
  Number(
    (
      await db.pool.query<{ n: string }>(
        `SELECT count(*) AS n FROM ltw_ai_accounting WHERE attempt_id = $1 AND kind <> 'evidence'`,
        [attemptId],
      )
    ).rows[0]?.n,
  );
const tryAdmit = async (micros: bigint, sessionId = 'session-9') => {
  const requestId = await startedRequest(db.pool, approvalId, { class: 'play', sessionId });
  const result = await store.admit(admission(requestId, micros), deadlineIn(10_000));
  return result.status === 'admitted' ? 'admitted' : `${result.code}:${result.detail}`;
};

describe('terminal settlement', () => {
  it('settles once; a retry is a duplicate and the hold shrinks to the charge', async () => {
    const attempt = await admitted(900n);
    expect(await charge(attempt, 300n)).toBe('settled');
    expect(await charge(attempt, 300n)).toBe('duplicate');
    expect(await effective(attempt)).toEqual({ effective: 300n, terminal: true, reserved: 900n });
    expect(await tryAdmit(700n, 'session-1')).toBe('admitted');
    const { rows } = await db.pool.query(
      `SELECT kind, provider_request_id, usage FROM ltw_ai_accounting`,
    );
    expect(rows).toEqual([
      {
        kind: 'settled',
        provider_request_id: 'msg_1',
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);
  });

  it('settle then reconcile: the reconciliation is evidence and never lowers the charge', async () => {
    const attempt = await admitted(900n);
    await charge(attempt, 300n);
    expect(
      await db.operator.reconcileAttempt({
        attemptId: attempt,
        chargeMicros: 100n,
        authorization: TEST_AUTH,
      }),
    ).toBe('evidence');
    expect((await effective(attempt))?.effective).toBe(300n);
    await db.operator.reconcileAttempt({
      attemptId: attempt,
      chargeMicros: 400n,
      authorization: TEST_AUTH,
    });
    expect((await effective(attempt))?.effective).toBe(400n);
    expect(await stops()).toEqual(['DISCREPANCY']);
  });

  it('reconcile then late settle: the late usage is evidence and may only raise', async () => {
    const attempt = await admitted(900n);
    expect(
      await db.operator.reconcileAttempt({
        attemptId: attempt,
        chargeMicros: 200n,
        authorization: TEST_AUTH,
      }),
    ).toBe('reconciled');
    expect((await effective(attempt))?.effective).toBe(200n);
    expect(await charge(attempt, 150n)).toBe('evidence');
    expect((await effective(attempt))?.effective).toBe(200n);
    expect(await stops()).toEqual([]);
    // A different later charge is never discarded: it raises the charge and stops.
    expect(await charge(attempt, 250n)).toBe('evidence');
    expect((await effective(attempt))?.effective).toBe(250n);
    expect(await stops()).toEqual(['DISCREPANCY']);
    expect(await charge(attempt, 250n)).toBe('duplicate');
    expect(await terminalRows(attempt)).toBe(1);
  });

  it('keeps a different later automatic charge: 300 then 900 on a 500 hold stops the session', async () => {
    const attempt = await admitted(500n);
    expect(await charge(attempt, 300n)).toBe('settled');
    expect(await charge(attempt, 300n)).toBe('duplicate');
    expect(await charge(attempt, 900n)).toBe('evidence');
    expect(await effective(attempt)).toEqual({ effective: 900n, terminal: true, reserved: 500n });
    expect(await stops()).toEqual(['OVERRUN']);
    expect(await tryAdmit(700n, 'session-1')).toBe('ADMISSION_DISABLED:STOPPED');
    // Even with the stop cleared, the session's 1,000 already holds 900.
    const { rows } = await db.pool.query<{ stop_id: string }>('SELECT stop_id FROM ltw_ai_stops');
    await db.operator.clearStop(rows[0]?.stop_id ?? '', TEST_AUTH);
    expect(await tryAdmit(700n, 'session-1')).toBe('BUDGET_DENIED:SESSION');
    expect(await terminalRows(attempt)).toBe(1);
  });

  it('records a same-charge settlement with different usage as non-reducing evidence', async () => {
    const attempt = await admitted(500n);
    expect(await charge(attempt, 300n)).toBe('settled');
    const differentUsage = {
      attemptId: attempt,
      chargeMicros: 300n,
      usage: { inputTokens: 11, outputTokens: 5 },
      returnedModel: 'claude-opus-5-5',
      providerRequestId: 'msg_1',
    };
    expect(await store.settle(differentUsage)).toBe('evidence');
    expect(await store.settle(differentUsage)).toBe('duplicate');
    // Key order of the usage object does not make an identical payload look different.
    expect(
      await store.settle({ ...differentUsage, usage: { outputTokens: 5, inputTokens: 11 } }),
    ).toBe('duplicate');
    expect(await effective(attempt)).toEqual({ effective: 300n, terminal: true, reserved: 500n });
    expect(await stops()).toEqual([]);
    expect(await terminalRows(attempt)).toBe(1);
  });

  it('releases only before any terminal row, once, and never an absent attempt', async () => {
    const attempt = await admitted(900n);
    expect(await store.releasePreDispatch(attempt)).toBe('released');
    expect(await store.releasePreDispatch(attempt)).toBe('already-terminal');
    expect(await store.releasePreDispatch('00000000-0000-4000-8000-00000000dead')).toBe('absent');
    expect((await effective(attempt))?.effective).toBe(0n);
    expect(await charge('00000000-0000-4000-8000-00000000dead', 1n)).toBe('absent');
    await expect(charge(attempt, -1n)).rejects.toMatchObject({ code: 'INVALID_CHARGE' });
  });
});

describe('open holds and evidence', () => {
  it('counts over-bound evidence on a crash-held attempt before any terminal row', async () => {
    const attempt = await admitted(500n);
    await db.operator.recordEvidence({
      attemptId: attempt,
      chargeMicros: 300n,
      authorization: TEST_AUTH,
    });
    expect(await effective(attempt)).toEqual({ effective: 500n, terminal: false, reserved: 500n });
    await db.operator.recordEvidence({
      attemptId: attempt,
      chargeMicros: 800n,
      authorization: TEST_AUTH,
    });
    expect(await effective(attempt)).toEqual({ effective: 800n, terminal: false, reserved: 500n });
    expect(await stops()).toEqual(['OVERRUN']);
    expect(await tryAdmit(1n)).toBe('ADMISSION_DISABLED:STOPPED');
  });

  it('stops the approval on an overrun until the operator clears it', async () => {
    const attempt = await admitted(500n);
    expect(await charge(attempt, 600n)).toBe('settled');
    expect(await tryAdmit(1n)).toBe('ADMISSION_DISABLED:STOPPED');
    const { rows } = await db.pool.query<{ stop_id: string }>('SELECT stop_id FROM ltw_ai_stops');
    await db.operator.clearStop(rows[0]?.stop_id ?? '', TEST_AUTH);
    expect(await tryAdmit(1n)).toBe('admitted');
  });

  it('keeps the hold and stops the account’s provider/model on an unexpected model', async () => {
    const attempt = await admitted(500n);
    await store.holdWithStop(attempt, 'UNEXPECTED_MODEL', 'claude-cheaper-9');
    expect(await effective(attempt)).toEqual({ effective: 500n, terminal: false, reserved: 500n });
    const { rows } = await db.pool.query(
      'SELECT approval_id, provider, model, observed_model FROM ltw_ai_stops',
    );
    expect(rows).toEqual([
      {
        approval_id: null,
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        observed_model: 'claude-cheaper-9',
      },
    ]);
    // Rotating to another approval on the same account does not bypass the stop.
    await seedApproval(db, { approvalId: 'rotated', createAccount: false });
    const requestId = await startedRequest(db.pool, 'rotated');
    expect(await store.admit(admission(requestId, 1n), deadlineIn(10_000))).toMatchObject({
      detail: 'STOPPED',
    });
    const other = await store.admit(
      admission(await startedRequest(db.pool, 'rotated'), 1n, { model: 'claude-sonnet-5-5' }),
      deadlineIn(10_000),
    );
    expect(other.status).toBe('admitted');
  });
});

describe('concurrent stopping settlements', () => {
  it('append both stops without deadlock, across midnight, then deny admission', async () => {
    const yesterday = await attemptOnEarlierDay(db.pool, approvalId, 300n, { sessionId: 's-a' });
    const today = await admitted(300n, 's-b');
    // Both lock sets share only the account-control and stage locks: hold the former.
    const barrier = await holdLock(
      db.database.url,
      bucketLockKey({ kind: 'account-control', accountId: 'acct' }),
    );
    const other = new PostgresBudgetStore(db.pool2());
    const settled = Promise.all([
      store.settle({
        attemptId: yesterday,
        chargeMicros: 400n,
        usage: null,
        returnedModel: null,
        providerRequestId: null,
      }),
      other.settle({
        attemptId: today,
        chargeMicros: 400n,
        usage: null,
        returnedModel: null,
        providerRequestId: null,
      }),
    ]);
    await advisoryWaiters(db.pool, 2);
    await barrier.release();
    expect(await settled).toEqual(['settled', 'settled']);
    expect(await stops()).toEqual(['OVERRUN', 'OVERRUN']);
    expect(await tryAdmit(1n)).toBe('ADMISSION_DISABLED:STOPPED');
  });
});
