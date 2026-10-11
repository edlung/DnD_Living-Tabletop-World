import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TEST_AUTH,
  accountingDb,
  advisoryWaiters,
  attemptOnEarlierDay,
  holdLock,
  seedApproval,
  startedRequest,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { FIXTURE_CATALOG } from '../../testing/catalog-fixtures.ts';
import { identityResolver } from '../catalog.ts';
import { deadlineIn } from './deadline.ts';
import { bucketLockKey } from './lock-keys.ts';
import { PostgresBudgetStore } from './postgres-budget-store.ts';
import { explainStops } from './stop-diagnostics.ts';
import type { AdmissionResult } from './types.ts';

/**
 * The approved B2 stop-scope delta (docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md) over real PostgreSQL:
 * an overrun or discrepancy keeps its approval-wide restriction and also blocks its source route
 * (account, provider, canonical model) on every approval and day; suspect-output stops keep their
 * scopes; malformed shapes and identity gaps fail closed for the account; one clearance lifts both.
 * Identity resolves through the fixture registry (`catalog-fixtures.ts`), never a live catalog.
 */
const SONNET = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  pricingVersion: 'fixture-anthropic-sonnet-2',
};
const DEEPSEEK = {
  provider: 'deepseek',
  model: 'deepseek-flash',
  pricingVersion: 'fixture-deepseek-1',
};
type Route = typeof SONNET;
const resolve = identityResolver(FIXTURE_CATALOG);

let db: AccountingDb;
let store: PostgresBudgetStore;
beforeEach(async () => {
  db = await accountingDb();
  store = new PostgresBudgetStore(db.pool, resolve);
  await seedApproval(db, { accountId: 'acct', approvalId: 'a1' });
  await seedApproval(db, { accountId: 'acct', approvalId: 'a2', createAccount: false });
  await seedApproval(db, { accountId: 'other', approvalId: 'b1' });
});
afterEach(async () => {
  await db.close();
});

async function admit(
  approvalId: string,
  route: Route,
  using: PostgresBudgetStore = store,
): Promise<AdmissionResult> {
  const requestId = await startedRequest(db.pool, approvalId);
  return using.admit(
    { requestId, attemptId: randomUUID(), attemptKind: 'initial', reserveMicros: 100n, ...route },
    deadlineIn(10_000),
  );
}
const verdict = async (approvalId: string, route: Route, using?: PostgresBudgetStore) => {
  const result = await admit(approvalId, route, using);
  return result.status === 'admitted' ? 'admitted' : `${result.code}/${result.detail}`;
};
const STOPPED = 'ADMISSION_DISABLED/STOPPED';

/** An admitted attempt on `route` whose settlement exceeds its reservation: an OVERRUN stop. */
async function overrun(approvalId: string, route: Route = SONNET): Promise<string> {
  const result = await admit(approvalId, route);
  if (result.status !== 'admitted') throw new Error(`not admitted: ${result.code}`);
  await store.settle({
    attemptId: result.attemptId,
    chargeMicros: 500n,
    usage: { input_tokens: 1 },
    returnedModel: route.model,
    providerRequestId: null,
  });
  return result.attemptId;
}

async function stopIds(): Promise<string[]> {
  const { rows } = await db.pool.query<{ stop_id: string }>(
    'SELECT stop_id::text FROM ltw_ai_stops ORDER BY created_at, stop_id',
  );
  return rows.map((row) => row.stop_id);
}
const clear = (stopId: string) => db.operator.clearStop(stopId, TEST_AUTH);

/** Inserts a stop row directly, in any shape (pre-B2 or malformed rows). */
async function insertStop(row: {
  reason: string;
  approvalId?: string | null;
  provider?: string | null;
  model?: string | null;
  attemptId?: string | null;
  accountId?: string;
}): Promise<string> {
  const stopId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_ai_stops (stop_id, account_id, approval_id, provider, model, reason, attempt_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      stopId,
      row.accountId ?? 'acct',
      row.approvalId ?? null,
      row.provider ?? null,
      row.model ?? null,
      row.reason,
      row.attemptId ?? null,
    ],
  );
  return stopId;
}

/** An attempt row as an earlier process recorded it, with any model and pricing version. */
async function recordedAttempt(
  approvalId: string,
  provider: string,
  model: string,
  pricing: string,
) {
  const requestId = await startedRequest(db.pool, approvalId);
  const attemptId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_ai_attempts (attempt_id, request_id, account_id, approval_id, campaign_id,
       session_class, session_id, billing_day, capability, attempt_kind, provider, model,
       pricing_version, reserved_micros)
     SELECT $1, $2, ap.account_id, ap.approval_id, 'ravenford', 'play', 'session-1',
       (clock_timestamp() AT TIME ZONE 'UTC')::date, 'reasoning', 'initial', $4, $5, $6, 100
     FROM ltw_ai_approvals ap WHERE ap.approval_id = $3`,
    [attemptId, requestId, approvalId, provider, model, pricing],
  );
  return attemptId;
}

describe('an overrun or discrepancy stop', () => {
  it('denies the sibling approval on the same route, in a fresh process and on the next day', async () => {
    await overrun('a1');
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    expect(await verdict('a2', SONNET, new PostgresBudgetStore(db.pool2(), resolve))).toBe(STOPPED);
    // A stop from an attempt made on an earlier UTC day still applies today.
    const db2 = await accountingDb();
    try {
      await seedApproval(db2, { accountId: 'acct', approvalId: 'a1' });
      await seedApproval(db2, { accountId: 'acct', approvalId: 'a2', createAccount: false });
      const earlier = await attemptOnEarlierDay(db2.pool, 'a1', 100n);
      await db2.pool.query(
        `INSERT INTO ltw_ai_stops (stop_id, account_id, approval_id, reason, attempt_id)
         VALUES ($1, 'acct', 'a1', 'OVERRUN', $2)`,
        [randomUUID(), earlier],
      );
      // That earlier attempt recorded `claude-opus-5-5` under `test-pricing-1`, which the fixture
      // registry cannot resolve: the identity gap fails closed for the whole account.
      const later = new PostgresBudgetStore(db2.pool, resolve);
      const requestId = await startedRequest(db2.pool, 'a2');
      expect(
        await later.admit(
          {
            requestId,
            attemptId: randomUUID(),
            attemptKind: 'initial',
            reserveMicros: 1n,
            ...DEEPSEEK,
          },
          deadlineIn(10_000),
        ),
      ).toMatchObject({ status: 'denied', code: 'ADMISSION_DISABLED', detail: 'STOPPED' });
    } finally {
      await db2.close();
    }
  });

  it('keeps its approval blocked on every route; other routes and accounts stay eligible', async () => {
    await overrun('a1');
    expect(await verdict('a1', DEEPSEEK)).toBe(STOPPED);
    expect(await verdict('a2', DEEPSEEK)).toBe('admitted');
    expect(await verdict('b1', SONNET)).toBe('admitted');
  });

  it('applies the wider match to a stop row written in the pre-B2 shape, without rewriting it', async () => {
    const attempt = await recordedAttempt(
      'a1',
      'anthropic',
      'claude-sonnet-5-5',
      'fixture-anthropic-sonnet-2',
    );
    const stop = await insertStop({ reason: 'DISCREPANCY', approvalId: 'a1', attemptId: attempt });
    const before = await db.pool.query('SELECT * FROM ltw_ai_stops');
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    expect((await db.pool.query('SELECT * FROM ltw_ai_stops')).rows).toEqual(before.rows);
    // One clearance lifts both restrictions; clearing an unrelated stop changes nothing.
    const unrelated = await insertStop({
      reason: 'UNVERIFIED_BILLING',
      provider: 'deepseek',
      accountId: 'other',
    });
    await clear(unrelated);
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    await clear(stop);
    expect(await verdict('a2', SONNET)).toBe('admitted');
    expect(await verdict('a1', DEEPSEEK)).toBe('admitted');
  });

  it('blocks a historical alias under the canonical model, across pricing versions', async () => {
    const legacy = await recordedAttempt(
      'a1',
      'anthropic',
      'claude-sonnet-legacy-alias',
      'fixture-anthropic-sonnet-1',
    );
    await insertStop({ reason: 'OVERRUN', approvalId: 'a1', attemptId: legacy });
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    expect(await verdict('a2', DEEPSEEK)).toBe('admitted');
  });

  it('fails closed for the whole account on an unresolvable historical identity', async () => {
    const unknown = await recordedAttempt(
      'a1',
      'anthropic',
      'claude-unmapped',
      'fixture-anthropic-sonnet-1',
    );
    await insertStop({ reason: 'OVERRUN', approvalId: 'a1', attemptId: unknown });
    expect(await verdict('a2', DEEPSEEK)).toBe(STOPPED);
    expect(await verdict('b1', SONNET)).toBe('admitted');
    // The trusted operator diagnostic names the cause; no campaign view ever shows it.
    expect(await explainStops(db.pool, 'acct', resolve)).toMatchObject([
      {
        reason: 'OVERRUN',
        shape: 'accepted',
        source: 'consistent',
        identity: 'unresolved',
        restricts: ['account'],
      },
    ]);
  });

  /** Each malformed or inconsistent row; `source` names the approval whose attempt it cites. */
  const MALFORMED: readonly (readonly [
    string,
    {
      readonly reason: string;
      readonly approvalId?: string | null;
      readonly provider?: string;
      readonly model?: string;
      readonly source: string | null;
    },
  ])[] = [
    ['a missing source attempt', { reason: 'OVERRUN', approvalId: 'a1', source: null }],
    ['a source attempt of another approval', { reason: 'OVERRUN', approvalId: 'a1', source: 'a2' }],
    [
      'a source attempt of another account',
      { reason: 'DISCREPANCY', approvalId: 'a1', source: 'b1' },
    ],
    [
      'a recorded provider on an overrun',
      { reason: 'OVERRUN', approvalId: 'a1', provider: 'anthropic', source: 'a1' },
    ],
    ['no approval on an overrun', { reason: 'OVERRUN', approvalId: null, source: 'a1' }],
    [
      'an approval on an unexpected-model stop',
      {
        reason: 'UNEXPECTED_MODEL',
        approvalId: 'a1',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        source: null,
      },
    ],
    [
      'a model on an unverified-billing stop',
      {
        reason: 'UNVERIFIED_BILLING',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        source: null,
      },
    ],
  ];

  it.each(MALFORMED)('fails closed for the recorded account only, with %s', async (_label, row) => {
    const { source, ...stop } = row;
    const attemptId =
      source === null
        ? null
        : await recordedAttempt(source, SONNET.provider, SONNET.model, SONNET.pricingVersion);
    await insertStop({ ...stop, attemptId });
    expect(await verdict('a2', DEEPSEEK)).toBe(STOPPED);
    expect(await verdict('a1', DEEPSEEK)).toBe(STOPPED);
    expect(await verdict('b1', DEEPSEEK)).toBe('admitted');
    expect(await explainStops(db.pool, 'acct', resolve)).toMatchObject([
      { restricts: ['account'] },
    ]);
  });
});

describe('each stop reason against each kind of admission', () => {
  /** [same approval, other route], [sibling, same route], [sibling, other route], [other account]. */
  const CASES = [
    ['OVERRUN', [STOPPED, STOPPED, 'admitted', 'admitted']],
    ['DISCREPANCY', [STOPPED, STOPPED, 'admitted', 'admitted']],
    ['UNEXPECTED_MODEL', ['admitted', STOPPED, 'admitted', 'admitted']],
    ['UNVERIFIED_BILLING', ['admitted', STOPPED, 'admitted', 'admitted']],
  ] as const;

  it.each(CASES)('%s', async (reason, expected) => {
    const source = await recordedAttempt(
      'a1',
      SONNET.provider,
      SONNET.model,
      SONNET.pricingVersion,
    );
    const routeWide = reason === 'OVERRUN' || reason === 'DISCREPANCY';
    await insertStop(
      routeWide
        ? { reason, approvalId: 'a1', attemptId: source }
        : {
            reason,
            provider: 'anthropic',
            model: reason === 'UNEXPECTED_MODEL' ? 'claude-sonnet-5-5-fixture-snapshot' : null,
            attemptId: source,
          },
    );
    expect([
      await verdict('a1', DEEPSEEK),
      await verdict('a2', SONNET),
      await verdict('a2', DEEPSEEK),
      await verdict('b1', SONNET),
    ]).toEqual(expected);
  });
});

describe('clearance, evidence and concurrency', () => {
  it('needs one clearance per stop, and never releases the holds it counted', async () => {
    const first = await overrun('a1');
    // The sibling's Sonnet route is already stopped; its second stop comes from DeepSeek.
    await overrun('a2', DEEPSEEK);
    const [one, two] = await stopIds();
    await clear(one ?? '');
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    await clear(two ?? '');
    expect(await verdict('a2', SONNET)).toBe('admitted');
    const { rows } = await db.pool.query<{ charge: string }>(
      `SELECT max(charge_micros)::text AS charge FROM ltw_ai_accounting WHERE attempt_id = $1`,
      [first],
    );
    expect(rows[0]?.charge).toBe('500');
  });

  it('blocks siblings after operator evidence above a crash-held attempt’s reservation', async () => {
    const held = await admit('a1', SONNET);
    if (held.status !== 'admitted') throw new Error('not admitted');
    const recorded = await db.operator.recordEvidence({
      attemptId: held.attemptId,
      chargeMicros: 900n,
      authorization: TEST_AUTH,
    });
    expect(recorded.stops).toHaveLength(1);
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    expect(await stopIds()).toEqual(recorded.stops);
  });

  it('serializes an overrun settlement and a sibling admission on the account lock, no deadlock', async () => {
    const first = await admit('a1', SONNET);
    if (first.status !== 'admitted') throw new Error('not admitted');
    const requestId = await startedRequest(db.pool, 'a2');
    const lock = await holdLock(
      db.database.url,
      bucketLockKey({ kind: 'account-control', accountId: 'acct' }),
    );
    const settling = store.settle({
      attemptId: first.attemptId,
      chargeMicros: 500n,
      usage: null,
      returnedModel: null,
      providerRequestId: null,
    });
    await advisoryWaiters(db.pool, 1);
    const sibling = new PostgresBudgetStore(db.pool2(), resolve).admit(
      {
        requestId,
        attemptId: randomUUID(),
        attemptKind: 'initial',
        reserveMicros: 100n,
        ...SONNET,
      },
      deadlineIn(10_000),
    );
    await advisoryWaiters(db.pool, 2);
    await lock.release();
    expect(await settling).toBe('settled');
    // The admission queued after the stopping settlement sees its committed stop.
    expect(await sibling).toMatchObject({ status: 'denied', detail: 'STOPPED' });
  });

  it('keeps an admission made before the stop: its hold still counts', async () => {
    const before = await admit('a2', SONNET);
    expect(before.status).toBe('admitted');
    await overrun('a1');
    expect(await verdict('a2', SONNET)).toBe(STOPPED);
    const { rows } = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ltw_ai_attempts a WHERE a.approval_id = 'a2'
         AND NOT EXISTS (SELECT 1 FROM ltw_ai_accounting c WHERE c.attempt_id = a.attempt_id)`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('admits only a canonical model of its verified pricing version', async () => {
    expect(await verdict('a1', { ...SONNET, model: 'claude-sonnet-5-5-fixture-snapshot' })).toBe(
      'ADMISSION_DISABLED/NOT_ELIGIBLE',
    );
    expect(await verdict('a1', { ...SONNET, pricingVersion: 'fixture-anthropic-sonnet-1' })).toBe(
      'ADMISSION_DISABLED/NOT_ELIGIBLE',
    );
  });
});
