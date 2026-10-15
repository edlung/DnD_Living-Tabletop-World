import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CEILINGS,
  TEST_AUTH,
  admission,
  accountingDb,
  asQueryable,
  seedApproval,
  startedRequest,
  type AccountingDb,
  TEST_RESOLVE,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { parseOperatorArgs } from './operator-args.ts';
import { runOperatorCommand } from './operator-commands.ts';
import { PostgresBudgetStore, accountingStatus } from './postgres-budget-store.ts';
import { finalize } from './request-journal.ts';
import { readAttemptCharge } from './spend.ts';

/**
 * Operator records (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2): duplicate grants and accounts,
 * append-only history, batch evidence rules, startup status, and the CLI path itself.
 */
let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});

describe('authorization identity', () => {
  it('refuses one grant behind two approvals, and a duplicate billing account', async () => {
    await seedApproval(db, { approvalId: 'a1' });
    await expect(
      db.operator.createApproval({
        approvalId: 'a2',
        accountId: 'acct',
        grantReference: 'grant-a1',
        stage: '300',
        ceilings: CEILINGS,
        campaignIds: ['ravenford'],
        authorization: TEST_AUTH,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(
      db.operator.createAccount({
        accountId: 'acct-2',
        providerAccountRef: 'ref-acct',
        globalDailyCeilingMicros: 1n,
        authorization: TEST_AUTH,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(
      seedApproval(db, { approvalId: 'a3', accountId: 'missing', createAccount: false }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_REFERENCE' });
    const { rows } = await db.pool.query('SELECT approval_id FROM ltw_ai_approvals');
    expect(rows).toEqual([{ approval_id: 'a1' }]);
  });

  it('keeps every revision on the original grant, with its own authorization', async () => {
    await seedApproval(db, { approvalId: 'a1' });
    await db.operator.reviseApproval({
      approvalId: 'a1',
      ceilings: { stageMicros: 2n },
      authorization: { ...TEST_AUTH, source: 'owner-message-2' },
    });
    const { rows } = await db.pool.query(
      `SELECT revision, grant_reference, authorization_source, stage_ceiling_micros::text AS stage
       FROM ltw_ai_approval_revisions ORDER BY revision`,
    );
    expect(rows).toEqual([
      {
        revision: 1,
        grant_reference: 'grant-a1',
        authorization_source: 'integration-test-fixture',
        stage: '1000000',
      },
      {
        revision: 2,
        grant_reference: 'grant-a1',
        authorization_source: 'owner-message-2',
        stage: '2',
      },
    ]);
    await expect(
      db.pool.query(
        `INSERT INTO ltw_ai_approval_revisions (approval_id, revision, grant_reference,
           stage_ceiling_micros, campaign_daily_ceiling_micros, play_session_ceiling_micros,
           evaluation_run_ceiling_micros, campaign_ids, enabled, owner_id, authorized_on,
           authorization_source)
         VALUES ('a1', 3, 'another-grant', 1, 1, 1, 1, '{ravenford}', true, 'o', '2026-10-11', 's')`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('never updates, deletes or truncates accounting history', async () => {
    await seedApproval(db, { approvalId: 'a1' });
    await startedRequest(db.pool, 'a1');
    for (const table of ['ltw_ai_approvals', 'ltw_ai_account_revisions', 'ltw_ai_requests']) {
      await expect(db.pool.query(`UPDATE ${table} SET created_at = now()`)).rejects.toThrow(
        /append-only/,
      );
      await expect(db.pool.query(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
      await expect(db.pool.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    }
  });
});

describe('batch evidence', () => {
  /** Two attempts in one window: `a` (hold 500) still open, `b` (hold 400) settled at 300. */
  async function windowWithAttempts() {
    const { approvalId } = await seedApproval(db, { ceilings: { playSessionMicros: 10_000n } });
    const store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
    const ids: { request: string; attempt: string }[] = [];
    for (const micros of [500n, 400n]) {
      const request = await startedRequest(db.pool, approvalId);
      const result = await store.admit(admission(request, micros), deadlineIn(10_000));
      if (result.status !== 'admitted') throw new Error('not admitted');
      ids.push({ request, attempt: result.attemptId });
    }
    const [a, b] = ids as [(typeof ids)[0], (typeof ids)[0]];
    await settleAt(store, b.attempt, 300n);
    return { store, a, b };
  }
  const settleAt = (store: PostgresBudgetStore, attemptId: string, micros: bigint) =>
    store.settle({
      attemptId,
      chargeMicros: micros,
      usage: null,
      returnedModel: null,
      providerRequestId: null,
    });
  const closedWindow = async () =>
    (
      await db.pool.query<{ start: string; end: string }>(
        `SELECT (clock_timestamp() - interval '1 hour')::text AS start,
           clock_timestamp()::text AS end`,
      )
    ).rows[0] ?? { start: '', end: '' };
  const batch = (
    window: { start: string; end: string },
    allocations: [string, bigint][],
    invoiced = 800n,
  ) => ({
    batchId: `b-${String(allocations.length)}-${String(invoiced)}`,
    accountId: 'acct',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    windowStart: window.start,
    windowEnd: window.end,
    invoicedTotalMicros: invoiced,
    evidenceReference: 'invoice-42',
    allocations: new Map(allocations),
  });
  const effectiveOf = async (attemptId: string) => {
    const client = await db.pool.connect();
    try {
      return (await readAttemptCharge(asQueryable(client), attemptId))?.effective;
    } finally {
      client.release();
    }
  };

  it('never treats a caller outcome as proof that a provider attempt finished', async () => {
    const { a, b } = await windowWithAttempts();
    // a's caller timed out with the provider attempt still pending; a recovered request likewise.
    const traceJson = JSON.stringify({ traceId: a.request });
    const timedOut = await finalize(
      db.pool,
      {
        requestId: a.request,
        status: 'TIMEOUT',
        provider: null,
        code: 'CALLER_CANCELLED',
        traceJson,
        trace: {
          campaignId: 'ravenford',
          actorId: 'dm-ravenford',
          purpose: 'relevance',
          createdAt: '2026-10-11T00:00:00.000Z',
        },
      },
      deadlineIn(5_000),
    );
    expect(timedOut).toBe('recorded');
    await db.pool.query(
      `INSERT INTO ltw_ai_request_outcomes (request_id, kind) VALUES ($1, 'recovered_incomplete')`,
      [b.request],
    );
    const window = await closedWindow();
    await expect(
      db.operator.recordBatchEvidence(
        batch(
          window,
          [
            [a.attempt, 10n],
            [b.attempt, 300n],
          ],
          310n,
        ),
        TEST_AUTH,
      ),
    ).rejects.toMatchObject({ code: 'ATTEMPTS_UNRESOLVED' });
    expect(await effectiveOf(a.attempt)).toBe(500n);
    expect((await db.pool.query('SELECT * FROM ltw_ai_evidence_batches')).rowCount).toBe(0);
    const kinds = await db.pool.query<{ kind: string }>('SELECT kind FROM ltw_ai_accounting');
    expect(kinds.rows).toEqual([{ kind: 'settled' }]);
  });

  it('refuses uncovered calls, open windows and unallocated totals', async () => {
    const { store, a, b } = await windowWithAttempts();
    await settleAt(store, a.attempt, 450n);
    const window = await closedWindow();
    const both: [string, bigint][] = [
      [a.attempt, 450n],
      [b.attempt, 350n],
    ];
    await expect(
      db.operator.recordBatchEvidence(batch(window, [[a.attempt, 800n]]), TEST_AUTH),
    ).rejects.toMatchObject({ code: 'WINDOW_NOT_COVERED' });
    await expect(
      db.operator.recordBatchEvidence(
        batch({ start: window.start, end: '2999-01-01T00:00:00Z' }, both),
        TEST_AUTH,
      ),
    ).rejects.toMatchObject({ code: 'WINDOW_OPEN' });
    await expect(
      db.operator.recordBatchEvidence(batch(window, both, 900n), TEST_AUTH),
    ).rejects.toMatchObject({ code: 'INVOICE_NOT_ALLOCATED' });
    expect((await db.pool.query('SELECT * FROM ltw_ai_evidence_batches')).rowCount).toBe(0);
  });

  it('adds only non-reducing evidence once every included attempt is terminal', async () => {
    const { store, a, b } = await windowWithAttempts();
    await settleAt(store, a.attempt, 450n);
    await db.operator.recordBatchEvidence(
      batch(
        await closedWindow(),
        [
          [a.attempt, 400n],
          [b.attempt, 350n],
        ],
        750n,
      ),
      TEST_AUTH,
    );
    const { rows } = await db.pool.query(
      `SELECT attempt_id, kind, charge_micros::text AS charge, batch_id FROM ltw_ai_accounting
       ORDER BY entry_id`,
    );
    expect(rows).toEqual([
      { attempt_id: b.attempt, kind: 'settled', charge: '300', batch_id: null },
      { attempt_id: a.attempt, kind: 'settled', charge: '450', batch_id: null },
      { attempt_id: a.attempt, kind: 'evidence', charge: '400', batch_id: 'b-2-750' },
      { attempt_id: b.attempt, kind: 'evidence', charge: '350', batch_id: 'b-2-750' },
    ]);
    expect(await effectiveOf(a.attempt)).toBe(450n);
    expect(await effectiveOf(b.attempt)).toBe(350n);
    const stops = await db.pool.query('SELECT reason FROM ltw_ai_stops');
    expect(stops.rows).toEqual([{ reason: 'DISCREPANCY' }]);
  });
});

describe('the operator CLI path and startup status', () => {
  it('creates records through the command runner and reports counts only', async () => {
    const auth = ['--owner', 'o', '--authorized-on', '2026-10-11', '--authorization-source', 's'];
    await runOperatorCommand(
      db.pool,
      parseOperatorArgs([
        'account-create',
        '--account',
        'acct',
        '--provider-account-ref',
        'r',
        '--global-daily-ceiling-micros',
        '1000',
        ...auth,
      ]),
    );
    await runOperatorCommand(
      db.pool,
      parseOperatorArgs(['account-revise', '--account', 'acct', '--disable', ...auth]),
    );
    expect(await runOperatorCommand(db.pool, parseOperatorArgs(['status']))).toEqual({
      openHolds: 0,
      activeStops: 0,
      incompleteRequests: 0,
      disabledAccounts: 1,
      disabledApprovals: 0,
      // The image ledger's own counters (ADR 0035 §2): no ceiling stored yet.
      images: {
        revision: null,
        ceilingMicros: null,
        spentMicros: '0',
        heldMicros: '0',
        remainingMicros: null,
        charges: 0,
        unsettled: 0,
      },
    });
    await seedApproval(db, { approvalId: 'a1', createAccount: false });
    await startedRequest(db.pool, 'a1');
    expect(await accountingStatus(db.pool)).toMatchObject({ incompleteRequests: 1 });
    expect(await runOperatorCommand(db.pool, parseOperatorArgs(['recover-incomplete']))).toEqual({
      recovered: 0,
      notEligible: 0,
      retryLater: 0,
    });
  });
});
