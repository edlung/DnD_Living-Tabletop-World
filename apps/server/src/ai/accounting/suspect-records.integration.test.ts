import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TEST_AUTH,
  TEST_RESOLVE,
  accountingDb,
  admission,
  answeredCommitPool,
  holdLock,
  seedApproval,
  startedRequest,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { AccountingTasks, type AccountingIssue } from '../accounting-tasks.ts';
import { readDiagnostic } from '../diagnostics.ts';
import { deadlineIn } from './deadline.ts';
import { POLICY_LOCK_KEY } from './lock-keys.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';

/**
 * A suspect response's stop and every response's request ID over PostgreSQL (docs/adr/0032-
 * live-ai.md, B2 repair 1): the stop write survives a transient failure through retries, never
 * appears twice (an ambiguous COMMIT or a retry after clearance appends nothing), and its route is
 * refused in-process until it commits; request IDs are kept for attempts without settled usage.
 */
let db: AccountingDb;
let store: PostgresBudgetStore;
let approvalId: string;
beforeEach(async () => {
  db = await accountingDb();
  store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
  ({ approvalId } = await seedApproval(db));
});
afterEach(async () => {
  await db.close();
});

async function admittedAttempt(): Promise<{ requestId: string; attemptId: string }> {
  const requestId = await startedRequest(db.pool, approvalId);
  const result = await store.admit(admission(requestId, 100n), deadlineIn(10_000));
  if (result.status !== 'admitted') throw new Error(`not admitted: ${result.code}`);
  return { requestId, attemptId: result.attemptId };
}
const stopRows = async () =>
  (await db.pool.query<{ reason: string }>('SELECT reason FROM ltw_ai_stops')).rows;
const suspect = (attemptId: string) =>
  ({
    attemptId,
    reason: 'UNEXPECTED_MODEL',
    returnedModel: 'claude-cheaper-model',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
  }) as const;

describe('the automatic stop of a suspect response', () => {
  it('is retried after a transient failure and refuses the route here until it commits', async () => {
    const { attemptId } = await admittedAttempt();
    // The exclusive policy lock (an operator mutation) outlasts the first 5 s write.
    const policy = await holdLock(db.database.url, POLICY_LOCK_KEY, 'exclusive');
    const issues: AccountingIssue[] = [];
    const tasks = new AccountingTasks((issue) => issues.push(issue), {
      sleep: async () => {
        await policy.release();
      },
    });
    tasks.holdWithStop(store, suspect(attemptId));
    expect(tasks.refuses('anthropic', 'claude-opus-5-5')).toBe(true);
    expect(tasks.refuses('anthropic', 'claude-other')).toBe(false);
    await tasks.idle();
    expect(await stopRows()).toEqual([{ reason: 'UNEXPECTED_MODEL' }]);
    expect(tasks.refuses('anthropic', 'claude-opus-5-5')).toBe(false);
    expect(issues).toEqual([]);
    // The committed stop now denies the route in every process.
    const requestId = await startedRequest(db.pool, approvalId);
    expect(await store.admit(admission(requestId, 1n), deadlineIn(10_000))).toMatchObject({
      status: 'denied',
      detail: 'STOPPED',
    });
  }, 20_000);

  it('appears once however often an ambiguous COMMIT makes it retry', async () => {
    const { attemptId } = await admittedAttempt();
    const ambiguous = answeredCommitPool(db.database.url, 'COMMIT', {
      code: '08006',
      severity: 'FATAL',
    });
    try {
      const issues: AccountingIssue[] = [];
      const tasks = new AccountingTasks((issue) => issues.push(issue), {
        sleep: () => Promise.resolve(),
      });
      tasks.holdWithStop(new PostgresBudgetStore(ambiguous, TEST_RESOLVE), suspect(attemptId));
      await tasks.idle();
      // Every answer was ambiguous: the route stays refused here, and only one stop exists.
      expect(issues).toEqual(['STOP_FAILED']);
      expect(tasks.refuses('anthropic', 'claude-opus-5-5')).toBe(true);
      expect(await stopRows()).toEqual([{ reason: 'UNEXPECTED_MODEL' }]);
    } finally {
      await ambiguous.end();
    }
  });

  it('is not appended again by a late retry after an operator cleared it', async () => {
    const { attemptId } = await admittedAttempt();
    await store.holdWithStop(attemptId, 'UNVERIFIED_BILLING', 'claude-opus-5-5');
    const { rows } = await db.pool.query<{ stop_id: string }>('SELECT stop_id FROM ltw_ai_stops');
    await db.operator.clearStop(rows[0]?.stop_id ?? '', TEST_AUTH);
    await store.holdWithStop(attemptId, 'UNVERIFIED_BILLING', 'claude-opus-5-5');
    expect(await stopRows()).toEqual([{ reason: 'UNVERIFIED_BILLING' }]);
  });
});

describe('provider request IDs', () => {
  it('are kept for an attempt without settled usage, once, and shown to the DM', async () => {
    const { requestId, attemptId } = await admittedAttempt();
    await store.recordResponse(attemptId, 'msg_01abc', 'claude-cheaper-model');
    await store.recordResponse(attemptId, 'msg_other', null);
    expect(await readDiagnostic(db.pool, 'ravenford', requestId)).toMatchObject({
      attempts: [
        {
          attemptId,
          accounting: 'open',
          providerRequestId: 'msg_01abc',
          returnedModel: 'claude-cheaper-model',
        },
      ],
    });
    await expect(
      db.pool.query('DELETE FROM ltw_ai_attempt_responses WHERE attempt_id = $1', [attemptId]),
    ).rejects.toThrow(/append-only/);
  });

  it('refuse an unsafe identifier', async () => {
    const { attemptId } = await admittedAttempt();
    await expect(store.recordResponse(attemptId, 'not a safe id', null)).rejects.toThrow();
    await expect(store.recordResponse(attemptId, 'msg_ok', 'bad model!')).rejects.toThrow();
  });
});
