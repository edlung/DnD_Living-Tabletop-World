import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseOperatorArgs } from '../ai/accounting/operator-args.ts';
import { runOperatorCommand } from '../ai/accounting/operator-commands.ts';
import { TEST_AUTH, accountingDb, type AccountingDb } from '../testing/accounting.ts';
import { PostgresImageLedger, imageBudgetStatus, setImageCeiling } from './ledger.ts';
import {
  ORPHAN_AFTER_MINUTES,
  imageChargesFor,
  openImageReservations,
  settleOrphanedReservation,
} from './ledger-operator.ts';

/**
 * Orphaned image reservations on PostgreSQL (migration 0012; docs/adr/0035-images.md, amendment
 * 2026-10-16): a job that stopped between its reservation and its settlement leaves the reservation
 * open, counted whole. The operator lists such reservations by age and closes one, whole or at the
 * amount the provider's records show, with the owner's authorization recorded beside it.
 */
let db: AccountingDb;
let ledger: PostgresImageLedger;
beforeEach(async () => {
  db = await accountingDb();
  ledger = new PostgresImageLedger(db.pool);
  await setImageCeiling(db.pool, 5_000_000n, TEST_AUTH);
});
afterEach(async () => {
  await db.close();
});

/** A reservation a job made `minutesAgo` minutes ago and never settled (a crash). */
async function reservedAgo(minutesAgo: number, requestId = 'r#0'): Promise<string> {
  const chargeId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_image_charges
       (charge_id, campaign_id, request_id, provider, model, reserved_micros, created_at)
     VALUES ($1, 'ravenford', $2, 'openrouter-openai', 'openai/gpt-5.4-image-2', 500000,
             clock_timestamp() - make_interval(mins => $3::int))`,
    [chargeId, requestId, minutesAgo],
  );
  return chargeId;
}

const settled = (chargeId: string, costMicros: bigint | null = 41_200n) =>
  ledger.settle(chargeId, {
    outcome: 'generated',
    costMicros,
    returnedModel: 'openai/gpt-5.4-image-2',
    providerRequestId: 'gen-1',
  });

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'settled',
    (error: unknown) => (error as { code?: string }).code ?? String(error),
  );

describe('orphaned image reservations', () => {
  it('are listed when unsettled and older than the given minutes, oldest first', async () => {
    const hour = await reservedAgo(60, 'a#0');
    const halfHour = await reservedAgo(30, 'b#0');
    const recent = await reservedAgo(1, 'c#0');
    await settled(await reservedAgo(90, 'd#0'));

    const old = await openImageReservations(db.pool, 20);
    expect(old.map((reservation) => reservation.chargeId)).toEqual([hour, halfHour]);
    expect(old[0]).toMatchObject({
      campaignId: 'ravenford',
      requestId: 'a#0',
      provider: 'openrouter-openai',
      model: 'openai/gpt-5.4-image-2',
      reservedMicros: '500000',
    });
    expect(old[0]?.ageMinutes).toBeGreaterThanOrEqual(60);
    expect(Date.parse(old[0]?.createdAt ?? '')).toBeLessThan(Date.now() - 59 * 60_000);
    expect((await openImageReservations(db.pool, 0)).map((r) => r.chargeId)).toEqual([
      hour,
      halfHour,
      recent,
    ]);
  });

  it('are settled whole by default: the hold closes, the spending stays, the owner is recorded', async () => {
    const orphan = await reservedAgo(ORPHAN_AFTER_MINUTES + 5);
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '500000',
      heldMicros: '500000',
      unsettled: 1,
    });
    expect(
      await settleOrphanedReservation(db.pool, {
        chargeId: orphan,
        chargeMicros: null,
        authorization: TEST_AUTH,
      }),
    ).toEqual({ chargeId: orphan, reservedMicros: '500000', chargedMicros: '500000' });
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '500000',
      heldMicros: '0',
      remainingMicros: '4500000',
      unsettled: 0,
    });
    const [record] = await imageChargesFor(db.pool, 'ravenford', 'r#0');
    expect(record?.settlement).toMatchObject({
      outcome: 'orphaned',
      chargedMicros: '500000',
      costReported: false,
      returnedModel: null,
      providerRequestId: null,
      authorization: TEST_AUTH,
    });
    expect(await openImageReservations(db.pool, 0)).toEqual([]);

    // The job's own settlement, arriving late, changes nothing.
    await settled(orphan, 1n);
    expect((await imageBudgetStatus(db.pool)).spentMicros).toBe('500000');
  });

  it('are settled at the amount the provider records show, which frees the rest', async () => {
    const orphan = await reservedAgo(ORPHAN_AFTER_MINUTES + 1);
    await settleOrphanedReservation(db.pool, {
      chargeId: orphan,
      chargeMicros: 41_200n,
      authorization: TEST_AUTH,
    });
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '41200',
      heldMicros: '0',
      remainingMicros: '4958800',
    });
    expect((await imageChargesFor(db.pool, 'ravenford', 'r#0'))[0]?.settlement).toMatchObject({
      outcome: 'orphaned',
      chargedMicros: '41200',
      costReported: false,
    });
  });

  it('refuse an unknown, an already settled or a recent reservation, and change nothing', async () => {
    const settle = (chargeId: string) =>
      refusal(
        settleOrphanedReservation(db.pool, {
          chargeId,
          chargeMicros: 0n,
          authorization: TEST_AUTH,
        }),
      );
    expect(await settle(randomUUID())).toBe('UNKNOWN_RESERVATION');

    const done = await reservedAgo(ORPHAN_AFTER_MINUTES + 30, 'done#0');
    await settled(done);
    expect(await settle(done)).toBe('ALREADY_SETTLED');

    // A running job may still settle these with the provider's reported cost.
    const young = await reservedAgo(ORPHAN_AFTER_MINUTES - 1, 'young#0');
    expect(await settle(young)).toBe('RESERVATION_TOO_RECENT');
    const running = randomUUID();
    expect(
      await ledger.reserve({
        chargeId: running,
        campaignId: 'ravenford',
        requestId: 'running#0',
        provider: 'openrouter-openai',
        model: 'openai/gpt-5.4-image-2',
        reserveMicros: 500_000n,
      }),
    ).toBe('reserved');
    expect(await settle(running)).toBe('RESERVATION_TOO_RECENT');
    expect((await openImageReservations(db.pool, 0)).map((r) => r.chargeId)).toEqual([
      young,
      running,
    ]);

    const rows = await db.pool.query(
      'SELECT count(*)::int AS n FROM ltw_image_operator_settlements',
    );
    expect(rows.rows[0]).toEqual({ n: 0 });
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '1041200',
      heldMicros: '1000000',
      unsettled: 2,
    });
  });

  it('keep the operator record append-only and bound to an orphaned settlement', async () => {
    const orphan = await reservedAgo(ORPHAN_AFTER_MINUTES + 1, 'o#0');
    await settleOrphanedReservation(db.pool, {
      chargeId: orphan,
      chargeMicros: null,
      authorization: TEST_AUTH,
    });
    for (const statement of [
      "UPDATE ltw_image_operator_settlements SET owner_id = 'someone else'",
      'DELETE FROM ltw_image_operator_settlements',
      'TRUNCATE ltw_image_operator_settlements',
    ]) {
      await expect(db.pool.query(statement), statement).rejects.toThrow();
    }

    // An orphaned settlement never commits without the owner's authorization beside it.
    const unauthorized = await reservedAgo(ORPHAN_AFTER_MINUTES + 1, 'u#0');
    await expect(
      db.pool.query(
        `INSERT INTO ltw_image_settlements (charge_id, outcome, charged_micros, cost_reported)
         VALUES ($1, 'orphaned', 500000, false)`,
        [unauthorized],
      ),
    ).rejects.toThrow(/authorization/);
    // An authorization belongs to an orphaned settlement only.
    const generated = await reservedAgo(ORPHAN_AFTER_MINUTES + 1, 'g#0');
    await settled(generated);
    await expect(
      db.pool.query(
        `INSERT INTO ltw_image_operator_settlements
           (charge_id, owner_id, authorized_on, authorization_source)
         VALUES ($1, 'owner', '2026-10-16', 'test')`,
        [generated],
      ),
    ).rejects.toThrow(/orphaned/);
    // The operator's amount is never the provider's report.
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        client.query(
          `INSERT INTO ltw_image_settlements (charge_id, outcome, charged_micros, cost_reported)
           VALUES ($1, 'orphaned', 1, true)`,
          [unauthorized],
        ),
      ).rejects.toThrow(/ltw_image_settlements_orphaned_check/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await openImageReservations(db.pool, 0)).map((r) => r.chargeId)).toEqual([
      unauthorized,
    ]);
  });
});

describe('the operator CLI', () => {
  it('lists orphaned reservations and settles one with the recorded authorization', async () => {
    const orphan = await reservedAgo(ORPHAN_AFTER_MINUTES + 10);
    await reservedAgo(2, 'fresh#0');
    const listed = await runOperatorCommand(
      db.pool,
      parseOperatorArgs(['image-reservations', '--older-than-minutes', '20']),
    );
    expect(listed).toMatchObject({
      olderThanMinutes: 20,
      settleableAfterMinutes: ORPHAN_AFTER_MINUTES,
      reservations: [{ chargeId: orphan, requestId: 'r#0', reservedMicros: '500000' }],
    });
    const result = await runOperatorCommand(
      db.pool,
      parseOperatorArgs([
        'image-reservation-settle',
        '--charge',
        orphan,
        '--owner',
        'owner',
        '--authorized-on',
        '2026-10-16',
        '--authorization-source',
        'owner message: close the crashed smoke hold',
      ]),
    );
    // Printed as JSON by the CLI: no bigint survives into the result.
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      settled: { chargeId: orphan, reservedMicros: '500000', chargedMicros: '500000' },
    });
    const stored = await db.pool.query(
      `SELECT owner_id, authorized_on::text AS on, authorization_source AS source
       FROM ltw_image_operator_settlements WHERE charge_id = $1`,
      [orphan],
    );
    expect(stored.rows).toEqual([
      {
        owner_id: 'owner',
        on: '2026-10-16',
        source: 'owner message: close the crashed smoke hold',
      },
    ]);
    expect(ORPHAN_AFTER_MINUTES).toBe(15);
  });
});
