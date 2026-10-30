import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresImageLedger, imageBudgetStatus, setImageCeiling } from '../../images/ledger.ts';
import {
  TEST_AUTH,
  TEST_RESOLVE,
  accountingDb,
  admission,
  seedApproval,
  startedRequest,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { deadlineIn } from './deadline.ts';
import { monetaryPolicyStatus, setMonetaryPolicy } from './monetary-policy.ts';
import { parseOperatorArgs } from './operator-args.ts';
import { runOperatorCommand } from './operator-commands.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import { spendReport } from './spend-report.ts';
import { explainStops } from './stop-diagnostics.ts';

let db: AccountingDb;
let store: PostgresBudgetStore;
beforeEach(async () => {
  db = await accountingDb();
  store = new PostgresBudgetStore(db.pool, TEST_RESOLVE);
});
afterEach(async () => db.close());

const textPolicy = { scope: 'text' as const, accountId: 'acct' };
const imagesPolicy = { scope: 'images' as const };
const authorization = TEST_AUTH;

async function attempt(approvalId: string, reserveMicros = 100n) {
  const request = admission(await startedRequest(db.pool, approvalId), reserveMicros);
  return { request, result: await store.admit(request, deadlineIn(10_000)) };
}

describe('explicit unlimited monetary policy', () => {
  it('exceeds every old monetary bucket while preserving holds and actual costs', async () => {
    const { approvalId } = await seedApproval(db, {
      globalDailyMicros: 1n,
      ceilings: { stageMicros: 1n, campaignDailyMicros: 1n, playSessionMicros: 1n },
    });
    expect((await attempt(approvalId)).result).toMatchObject({ status: 'denied' });
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    const first = await attempt(approvalId);
    expect(first.result.status).toBe('admitted');
    await store.settle({
      attemptId: first.request.attemptId,
      chargeMicros: 500n,
      usage: { inputTokens: 5 },
      returnedModel: first.request.model,
      providerRequestId: 'request-1',
    });
    expect((await attempt(approvalId)).result.status).toBe('admitted');
    const report = await spendReport(db.pool);
    expect(report.accounts[0]).toMatchObject({ totalMicros: '600', openHoldMicros: '100' });
    expect(report.approvals[0]).toMatchObject({ spentMicros: '600' });
    expect((await db.pool.query('SELECT reason FROM ltw_ai_stops')).rows).toEqual([]);
    expect(
      (await db.pool.query<{ usage: unknown }>('SELECT usage FROM ltw_ai_accounting')).rows[0]
        ?.usage,
    ).toEqual({
      inputTokens: 5,
    });
    expect(
      (await db.pool.query('SELECT monetary_policy_revision FROM ltw_ai_attempts')).rows,
    ).toEqual([{ monetary_policy_revision: 1 }, { monetary_policy_revision: 1 }]);
  });

  it('keeps finite history and restores its caps only through an explicit finite policy', async () => {
    const { approvalId } = await seedApproval(db, { globalDailyMicros: 1n });
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    expect((await attempt(approvalId)).result.status).toBe('admitted');
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'FINITE', authorization });
    expect((await attempt(approvalId)).result).toMatchObject({
      status: 'denied',
      code: 'BUDGET_DENIED',
      detail: 'GLOBAL_DAY',
    });
    expect(await monetaryPolicyStatus(db.pool, textPolicy)).toMatchObject({
      revision: 2,
      mode: 'FINITE',
      ownerId: TEST_AUTH.ownerId,
    });
    expect(
      (
        await db.pool.query(
          'SELECT global_daily_ceiling_micros::text AS n FROM ltw_ai_account_revisions',
        )
      ).rows,
    ).toEqual([{ n: '1' }]);
    await expect(db.pool.query('DELETE FROM ltw_ai_text_policies')).rejects.toThrow();
  });

  it('removes the registered evaluation-run ceiling without making an unregistered run eligible', async () => {
    const { approvalId } = await seedApproval(db, { ceilings: { evaluationRunMicros: 1n } });
    await db.operator.registerEvaluationRun({
      runId: 'evaluation-1',
      approvalId,
      campaignId: 'ravenford',
      authorization,
    });
    const request = admission(
      await startedRequest(db.pool, approvalId, { class: 'evaluation', runId: 'evaluation-1' }),
      100n,
    );
    expect(await store.admit(request, deadlineIn(10_000))).toMatchObject({ detail: 'SESSION' });
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    expect(
      await store.admit({ ...request, attemptId: randomUUID() }, deadlineIn(10_000)),
    ).toMatchObject({ status: 'admitted' });
  });

  it('applies unlimited monetary policy to operator reconciliation without suppressing billing evidence', async () => {
    const { approvalId } = await seedApproval(db);
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    const first = await attempt(approvalId);
    expect(
      await db.operator.reconcileAttempt({
        attemptId: first.request.attemptId,
        chargeMicros: 500n,
        authorization,
      }),
    ).toMatchObject({ recorded: 'reconciled', stops: [] });
    const evidence = await db.operator.recordEvidence({
      attemptId: first.request.attemptId,
      chargeMicros: 600n,
      authorization,
    });
    expect(evidence.stops).toHaveLength(1);
    expect((await db.pool.query('SELECT reason FROM ltw_ai_stops')).rows).toEqual([
      { reason: 'DISCREPANCY' },
    ]);
  });

  it('does not grant eligibility to another account, campaign, inactive approval or missing session', async () => {
    const { approvalId } = await seedApproval(db);
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    const foreign = await seedApproval(db, {
      accountId: 'other',
      approvalId: 'foreign',
      globalDailyMicros: 1n,
    });
    expect((await attempt(foreign.approvalId)).result).toMatchObject({
      status: 'denied',
      code: 'BUDGET_DENIED',
    });
    const out = admission(
      await startedRequest(db.pool, approvalId, { class: 'play', sessionId: 's' }, 'other'),
      100n,
    );
    expect(await store.admit(out, deadlineIn(10_000))).toMatchObject({
      detail: 'CAMPAIGN_NOT_BOUND',
    });
    const local = admission(await startedRequest(db.pool, approvalId, null), 100n);
    expect(await store.admit(local, deadlineIn(10_000))).toMatchObject({ detail: 'NOT_ELIGIBLE' });
    const unregistered = admission(
      await startedRequest(db.pool, approvalId, { class: 'evaluation', runId: 'absent' }),
      100n,
    );
    expect(await store.admit(unregistered, deadlineIn(10_000))).toMatchObject({
      detail: 'RUN_NOT_REGISTERED',
    });
    await db.operator.reviseApproval({ approvalId, enabled: false, authorization });
    expect((await attempt(approvalId)).result).toMatchObject({ detail: 'APPROVAL_DISABLED' });
  });

  it('ignores valid historic monetary overrun stops but retains genuine billing discrepancies', async () => {
    const { approvalId } = await seedApproval(db);
    const first = await attempt(approvalId);
    await store.settle({
      attemptId: first.request.attemptId,
      chargeMicros: 200n,
      usage: {},
      returnedModel: first.request.model,
      providerRequestId: null,
    });
    expect((await attempt(approvalId)).result).toMatchObject({ detail: 'STOPPED' });
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    expect((await attempt(approvalId)).result.status).toBe('admitted');
    expect(await explainStops(db.pool, 'acct', TEST_RESOLVE)).toMatchObject([
      { reason: 'OVERRUN', restricts: [], supersededByMonetaryPolicy: 'UNLIMITED' },
    ]);
    await store.settle({
      attemptId: first.request.attemptId,
      chargeMicros: 300n,
      usage: {},
      returnedModel: first.request.model,
      providerRequestId: null,
    });
    expect(
      (await db.pool.query('SELECT reason FROM ltw_ai_stops ORDER BY created_at')).rows,
    ).toEqual([{ reason: 'OVERRUN' }, { reason: 'DISCREPANCY' }]);
    expect((await attempt(approvalId)).result).toMatchObject({ detail: 'STOPPED' });
  });

  it.each(['UNEXPECTED_MODEL', 'UNVERIFIED_BILLING'] as const)(
    'retains %s stop and the unknown-cost hold',
    async (reason) => {
      const { approvalId } = await seedApproval(db);
      await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
      const first = await attempt(approvalId);
      await store.holdWithStop(first.request.attemptId, reason, null);
      expect((await attempt(approvalId)).result).toMatchObject({ detail: 'STOPPED' });
      expect((await spendReport(db.pool)).accounts[0]?.openHoldMicros).toBe('100');
    },
  );

  it('admits competing oversized reservations and retains each one', async () => {
    const { approvalId } = await seedApproval(db, { globalDailyMicros: 1n });
    await setMonetaryPolicy(db.pool, { ...textPolicy, mode: 'UNLIMITED', authorization });
    const other = new PostgresBudgetStore(db.pool2(), TEST_RESOLVE);
    const starts = await Promise.all(
      Array.from({ length: 4 }, () => startedRequest(db.pool, approvalId)),
    );
    const results = await Promise.all(
      starts.map((id, index) =>
        (index % 2 ? other : store).admit(admission(id, 100n), deadlineIn(10_000)),
      ),
    );
    expect(results.every((r) => r.status === 'admitted')).toBe(true);
    expect((await spendReport(db.pool)).accounts[0]?.openHoldMicros).toBe('400');
  });

  it('allows images without a numeric ceiling and preserves known/unknown spending', async () => {
    const ledger = new PostgresImageLedger(db.pool);
    const charge = () => ({
      chargeId: randomUUID(),
      campaignId: 'ravenford',
      requestId: randomUUID(),
      provider: 'openrouter',
      model: 'openai/gpt-5.4-image-2',
      reserveMicros: 100n,
    });
    expect(await ledger.reserve(charge())).toBe('no-budget');
    await setImageCeiling(db.pool, 0n, authorization);
    await setMonetaryPolicy(db.pool, { ...imagesPolicy, mode: 'UNLIMITED', authorization });
    const first = charge();
    expect(await ledger.reserve(first)).toBe('reserved');
    await ledger.settle(first.chargeId, {
      outcome: 'generated',
      costMicros: 500n,
      returnedModel: first.model,
      providerRequestId: 'image-1',
    });
    const unknown = charge();
    expect(await ledger.reserve(unknown)).toBe('reserved');
    await ledger.settle(unknown.chargeId, {
      outcome: 'timeout',
      costMicros: null,
      returnedModel: null,
      providerRequestId: null,
    });
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      ceilingMicros: null,
      remainingMicros: null,
      spentMicros: '600',
      charges: 2,
      monetaryPolicy: { mode: 'UNLIMITED' },
    });
    expect(
      (await db.pool.query('SELECT monetary_policy_revision FROM ltw_image_charges')).rows,
    ).toEqual([{ monetary_policy_revision: 1 }, { monetary_policy_revision: 1 }]);
    await setMonetaryPolicy(db.pool, { ...imagesPolicy, mode: 'FINITE', authorization });
    expect(await ledger.reserve(charge())).toBe('ceiling');
    expect(
      (await db.pool.query('SELECT ceiling_micros::text AS n FROM ltw_image_budget')).rows,
    ).toEqual([{ n: '0' }]);
  });

  it('records operator authorization and refuses unknown scopes or missing authorization', async () => {
    await seedApproval(db);
    const flags = [
      '--owner',
      TEST_AUTH.ownerId,
      '--authorized-on',
      TEST_AUTH.authorizedOn,
      '--authorization-source',
      TEST_AUTH.source,
    ];
    expect(
      await runOperatorCommand(
        db.pool,
        parseOperatorArgs([
          'monetary-policy-set',
          '--scope',
          'text',
          '--account',
          'acct',
          '--mode',
          'unlimited',
          ...flags,
        ]),
      ),
    ).toMatchObject({ monetaryPolicyRevision: 1 });
    expect(await monetaryPolicyStatus(db.pool, textPolicy)).toMatchObject({
      mode: 'UNLIMITED',
      ownerId: TEST_AUTH.ownerId,
      authorizationSource: TEST_AUTH.source,
    });
    expect(() =>
      parseOperatorArgs(['monetary-policy-set', '--scope', 'images', '--mode', 'unlimited']),
    ).toThrow();
    expect(() =>
      parseOperatorArgs([
        'monetary-policy-set',
        '--scope',
        'unknown',
        '--mode',
        'unlimited',
        ...flags,
      ]),
    ).toThrow();
    expect(() =>
      parseOperatorArgs([
        'monetary-policy-set',
        '--scope',
        'images',
        '--account',
        'acct',
        '--mode',
        'unlimited',
        ...flags,
      ]),
    ).toThrow();
  });
});
