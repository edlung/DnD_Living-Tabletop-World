import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TEST_AUTH,
  admission,
  accountingDb,
  attemptOnEarlierDay,
  seedApproval,
  startedRequest,
  type AccountingDb,
  TEST_RESOLVE,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import type { AccountingSession, AdmissionResult } from './types.ts';

/**
 * The four mandatory ceilings and who owns them (docs/STAGE_300_REMEDIATION_DESIGN.md §1): the
 * account's global UTC day, the campaign UTC day across approvals, the cumulative stage grant and
 * the per-session/run ceiling; rotation, revisions, eligibility and midnight.
 */
let db: AccountingDb;
let store: PostgresBudgetStore;
beforeEach(async () => {
  db = await accountingDb();
  store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
});
afterEach(async () => {
  await db.close();
});

const PLAY = (sessionId = 'session-1'): AccountingSession => ({ class: 'play', sessionId });
const outcome = (result: AdmissionResult) =>
  result.status === 'admitted' ? 'admitted' : `${result.code}:${result.detail}`;

async function spend(
  approvalId: string | null,
  micros: bigint,
  session: AccountingSession | null = PLAY(),
  campaignId = 'ravenford',
): Promise<string> {
  const requestId = await startedRequest(db.pool, approvalId, session, campaignId);
  return outcome(await store.admit(admission(requestId, micros), deadlineIn(10_000)));
}

describe('the global daily ceiling belongs to the billing account', () => {
  it('is shared by rotated approvals and revised only on the account', async () => {
    await seedApproval(db, { approvalId: 'a1', globalDailyMicros: 1_000n });
    await seedApproval(db, { approvalId: 'a2', createAccount: false, campaignIds: ['other'] });
    expect(await spend('a1', 700n)).toBe('admitted');
    expect(await spend('a2', 400n, PLAY(), 'other')).toBe('BUDGET_DENIED:GLOBAL_DAY');

    await db.operator.reviseAccount({
      accountId: 'acct',
      globalDailyCeilingMicros: 2_000n,
      authorization: TEST_AUTH,
    });
    expect(await spend('a2', 400n, PLAY(), 'other')).toBe('admitted');
    // Lowering a ceiling never erases what was spent.
    await db.operator.reviseAccount({
      accountId: 'acct',
      globalDailyCeilingMicros: 500n,
      authorization: TEST_AUTH,
    });
    expect(await spend('a1', 1n)).toBe('BUDGET_DENIED:GLOBAL_DAY');
  });

  it('keeps a campaign’s UTC day across approvals', async () => {
    await seedApproval(db, { approvalId: 'a1', ceilings: { campaignDailyMicros: 1_000n } });
    await seedApproval(db, {
      approvalId: 'a2',
      createAccount: false,
      ceilings: { campaignDailyMicros: 1_000n },
    });
    expect(await spend('a1', 700n)).toBe('admitted');
    expect(await spend('a2', 400n, PLAY('session-2'))).toBe('BUDGET_DENIED:CAMPAIGN_DAY');
  });
});

describe('the cumulative stage grant and session ceilings', () => {
  it('accumulates the stage across days, play sessions and evaluation runs', async () => {
    const { approvalId } = await seedApproval(db, { ceilings: { stageMicros: 1_000n } });
    await attemptOnEarlierDay(db.pool, approvalId, 600n);
    expect(await spend(approvalId, 300n, PLAY('session-2'))).toBe('admitted');
    await db.operator.registerEvaluationRun({
      runId: 'run-1',
      approvalId,
      campaignId: 'ravenford',
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 200n, { class: 'evaluation', runId: 'run-1' })).toBe(
      'BUDGET_DENIED:STAGE',
    );
  });

  it('revises ceilings without resetting consumption or changing identity', async () => {
    const { approvalId } = await seedApproval(db, { ceilings: { stageMicros: 1_000n } });
    expect(await spend(approvalId, 800n)).toBe('admitted');
    await db.operator.reviseApproval({
      approvalId,
      ceilings: { stageMicros: 900n },
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 200n, PLAY('session-2'))).toBe('BUDGET_DENIED:STAGE');
    await db.operator.reviseApproval({
      approvalId,
      ceilings: { stageMicros: 1_200n },
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 200n, PLAY('session-2'))).toBe('admitted');
  });

  it('applies one uniform ceiling per play session, separately per session', async () => {
    const { approvalId } = await seedApproval(db, { ceilings: { playSessionMicros: 500n } });
    expect(await spend(approvalId, 400n)).toBe('admitted');
    expect(await spend(approvalId, 200n)).toBe('BUDGET_DENIED:SESSION');
    // A new session is a rate guard, not new stage money: it gets its own 500.
    expect(await spend(approvalId, 200n, PLAY('session-2'))).toBe('admitted');
  });

  it('admits evaluation only for a registered run pinned to its campaign', async () => {
    const { approvalId } = await seedApproval(db, {
      campaignIds: ['ravenford', 'other'],
      ceilings: { evaluationRunMicros: 300n, playSessionMicros: 5_000n },
    });
    const run = { class: 'evaluation', runId: 'run-1' } as const;
    expect(await spend(approvalId, 100n, run)).toBe('ADMISSION_DISABLED:RUN_NOT_REGISTERED');
    await db.operator.registerEvaluationRun({
      runId: 'run-1',
      approvalId,
      campaignId: 'ravenford',
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 100n, run, 'other')).toBe(
      'ADMISSION_DISABLED:RUN_NOT_REGISTERED',
    );
    expect(await spend(approvalId, 200n, run)).toBe('admitted');
    expect(await spend(approvalId, 200n, run)).toBe('BUDGET_DENIED:SESSION');
    // A play session with the run's ID is a different session class and bucket.
    expect(await spend(approvalId, 200n, PLAY('run-1'))).toBe('admitted');
    await expect(
      db.operator.registerEvaluationRun({
        runId: 'run-2',
        approvalId,
        campaignId: 'unbound',
        authorization: TEST_AUTH,
      }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_BOUND' });
  });
});

describe('eligibility', () => {
  it('denies without an approval, a session, a bound campaign or enabled records', async () => {
    const { approvalId } = await seedApproval(db);
    expect(await spend(null, 1n, PLAY())).toBe('ADMISSION_DISABLED:NOT_ELIGIBLE');
    expect(await spend(approvalId, 1n, null)).toBe('ADMISSION_DISABLED:NOT_ELIGIBLE');
    expect(await spend(approvalId, 1n, PLAY(), 'elsewhere')).toBe(
      'ADMISSION_DISABLED:CAMPAIGN_NOT_BOUND',
    );
    expect(outcome(await store.admit(admission(randomUUID(), 1n), deadlineIn(10_000)))).toBe(
      'ADMISSION_DISABLED:UNKNOWN_REQUEST',
    );
    expect(await spend(approvalId, 0n)).toBe('ADMISSION_DISABLED:INVALID_RESERVATION');

    await db.operator.reviseApproval({
      approvalId,
      enabled: false,
      ceilings: {},
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 1n)).toBe('ADMISSION_DISABLED:APPROVAL_DISABLED');
    await db.operator.reviseApproval({
      approvalId,
      enabled: true,
      ceilings: {},
      authorization: TEST_AUTH,
    });
    await db.operator.reviseAccount({
      accountId: 'acct',
      enabled: false,
      authorization: TEST_AUTH,
    });
    expect(await spend(approvalId, 1n)).toBe('ADMISSION_DISABLED:ACCOUNT_DISABLED');
    await db.operator.reviseAccount({ accountId: 'acct', enabled: true, authorization: TEST_AUTH });
    expect(await spend(approvalId, 1n)).toBe('admitted');
  });

  it('refuses non-positive ceilings in the schema itself', async () => {
    await seedApproval(db, { approvalId: 'a1' });
    await expect(
      db.pool.query(
        `INSERT INTO ltw_ai_account_revisions (account_id, revision, global_daily_ceiling_micros,
           enabled, owner_id, authorized_on, authorization_source)
         VALUES ('acct', 9, 0, true, 'o', '2026-10-11', 's')`,
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.operator.reviseApproval({
        approvalId: 'a1',
        ceilings: { playSessionMicros: -1n },
        authorization: TEST_AUTH,
      }),
    ).rejects.toMatchObject({ code: 'CEILING_NOT_POSITIVE' });
  });
});

describe('midnight', () => {
  it('charges a late settlement to its admission day, not to today', async () => {
    const { approvalId } = await seedApproval(db, {
      globalDailyMicros: 1_000n,
      ceilings: { stageMicros: 10_000n, campaignDailyMicros: 1_000n, playSessionMicros: 10_000n },
    });
    const yesterday = await attemptOnEarlierDay(db.pool, approvalId, 900n);
    expect(await spend(approvalId, 900n)).toBe('admitted');
    expect(
      await store.settle({
        attemptId: yesterday,
        chargeMicros: 850n,
        usage: null,
        returnedModel: null,
        providerRequestId: null,
      }),
    ).toBe('settled');
    // Today: 900 held; yesterday's 850 does not count against today's day buckets.
    expect(await spend(approvalId, 100n)).toBe('admitted');
    expect(await spend(approvalId, 1n)).toBe('BUDGET_DENIED:GLOBAL_DAY');
  });
});
