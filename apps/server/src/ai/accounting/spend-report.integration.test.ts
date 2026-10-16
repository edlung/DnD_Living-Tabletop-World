import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresImageLedger, setImageCeiling } from '../../images/ledger.ts';
import { ORPHAN_AFTER_MINUTES } from '../../images/ledger-operator.ts';
import {
  TEST_AUTH,
  accountingDb,
  attemptOnEarlierDay,
  databaseDay,
  seedApproval,
  type AccountingDb,
} from '../../testing/accounting.ts';
import { parseOperatorArgs } from './operator-args.ts';
import { runOperatorCommand } from './operator-commands.ts';

/**
 * `ai:operator spend` (docs/adr/0037-deployment.md, operations): effective spend per account
 * (today and in total), open holds, and per approval against its stage ceiling, with the
 * effective-charge definition of `spend.ts`; beside them the image ledger (docs/adr/0035-images.md
 * §2): ceiling, spent, held, remaining and every unsettled reservation; read-only.
 */
let db: AccountingDb;
beforeEach(async () => {
  db = await accountingDb();
});
afterEach(async () => {
  await db.close();
});

/** A terminal settlement of `micros` for an attempt (as the settlement path appends it). */
async function settle(attemptId: string, micros: bigint): Promise<void> {
  await db.pool.query(
    `INSERT INTO ltw_ai_accounting (attempt_id, kind, transition_key, charge_micros)
     VALUES ($1, 'settled', $2, $3)`,
    [attemptId, `settle:${randomUUID()}`, micros.toString()],
  );
}

const spend = () => runOperatorCommand(db.pool, parseOperatorArgs(['spend']));

/** The image ledger with no ceiling stored: no image call is admitted, nothing was spent. */
const NO_IMAGES = {
  revision: null,
  ceilingMicros: null,
  spentMicros: '0',
  heldMicros: '0',
  remainingMicros: null,
  charges: 0,
  unsettled: 0,
  unsettledReservations: [],
  settleableAfterMinutes: ORPHAN_AFTER_MINUTES,
};

/** An image reservation a job made `minutesAgo` minutes ago (as `PostgresImageLedger` writes it). */
async function reserved(micros: number, minutesAgo: number, requestId: string): Promise<string> {
  const chargeId = randomUUID();
  await db.pool.query(
    `INSERT INTO ltw_image_charges
       (charge_id, campaign_id, request_id, provider, model, reserved_micros, created_at)
     VALUES ($1, 'ravenford', $2, 'openrouter-openai', 'openai/gpt-5.4-image-2', $3,
             clock_timestamp() - make_interval(mins => $4::int))`,
    [chargeId, requestId, micros, minutesAgo],
  );
  return chargeId;
}

describe('ai:operator spend', () => {
  it('reports effective spend today and in total, open holds, and each approval', async () => {
    const { approvalId } = await seedApproval(db, { approvalId: 'a1' });
    await seedApproval(db, { accountId: 'quiet', approvalId: 'a2' });
    await runOperatorCommand(
      db.pool,
      parseOperatorArgs([
        'account-revise',
        '--account',
        'quiet',
        '--disable',
        '--owner',
        TEST_AUTH.ownerId,
        '--authorized-on',
        TEST_AUTH.authorizedOn,
        '--authorization-source',
        TEST_AUTH.source,
      ]),
    );
    // Today: one attempt settled below its hold, one still held; two days ago: one settled.
    const settledToday = await attemptOnEarlierDay(db.pool, approvalId, 500n, { daysAgo: 0 });
    await settle(settledToday, 300n);
    await attemptOnEarlierDay(db.pool, approvalId, 200n, { daysAgo: 0 });
    const earlier = await attemptOnEarlierDay(db.pool, approvalId, 400n, { daysAgo: 2 });
    await settle(earlier, 400n);

    expect(await spend()).toEqual({
      day: await databaseDay(db.pool),
      accounts: [
        {
          accountId: 'acct',
          enabled: true,
          globalDailyCeilingMicros: '1000000',
          todayMicros: '500',
          totalMicros: '900',
          openHoldMicros: '200',
        },
        {
          accountId: 'quiet',
          enabled: false,
          globalDailyCeilingMicros: '1000000',
          todayMicros: '0',
          totalMicros: '0',
          openHoldMicros: '0',
        },
      ],
      approvals: [
        {
          approvalId: 'a1',
          accountId: 'acct',
          stage: '300',
          enabled: true,
          stageCeilingMicros: '1000000',
          spentMicros: '900',
        },
        {
          approvalId: 'a2',
          accountId: 'quiet',
          stage: '300',
          enabled: true,
          stageCeilingMicros: '1000000',
          spentMicros: '0',
        },
      ],
      images: NO_IMAGES,
    });
  });

  it('is empty without operator records, and takes no flags', async () => {
    expect(await spend()).toEqual({
      day: await databaseDay(db.pool),
      accounts: [],
      approvals: [],
      images: NO_IMAGES,
    });
    expect(() => parseOperatorArgs(['spend', '--account', 'acct'])).toThrow(/does not take/);
  });

  it('reports the image ceiling, spent, held, remaining and each unsettled reservation', async () => {
    const ledger = new PostgresImageLedger(db.pool);
    await setImageCeiling(db.pool, 5_000_000n, TEST_AUTH);
    // Settled at the provider's reported cost; never sent (released); open since 40 minutes (a
    // stopped job: orphaned) and since a moment (a job running now).
    const generated = await reserved(500_000, 50, 'tomas#0');
    await ledger.settle(generated, {
      outcome: 'generated',
      costMicros: 240_833n,
      returnedModel: 'openai/gpt-5.4-image-2',
      providerRequestId: 'gen-1',
    });
    const unsent = await reserved(500_000, 45, 'mira#0');
    await ledger.settle(unsent, {
      outcome: 'not-sent',
      costMicros: null,
      returnedModel: null,
      providerRequestId: null,
    });
    const orphaned = await reserved(500_000, 40, 'thorne#0');
    const running = await reserved(200_000, 0, 'orin#0');

    const { images } = (await spend()) as { images: Record<string, unknown> };
    expect(images).toMatchObject({
      revision: 1,
      ceilingMicros: '5000000',
      spentMicros: '940833',
      heldMicros: '700000',
      remainingMicros: '4059167',
      charges: 4,
      unsettled: 2,
      settleableAfterMinutes: ORPHAN_AFTER_MINUTES,
    });
    const open = images['unsettledReservations'] as { chargeId: string; ageMinutes: number }[];
    expect(open.map(({ chargeId }) => chargeId)).toEqual([orphaned, running]);
    expect(open[0]).toMatchObject({
      campaignId: 'ravenford',
      requestId: 'thorne#0',
      provider: 'openrouter-openai',
      model: 'openai/gpt-5.4-image-2',
      reservedMicros: '500000',
    });
    expect(open[0]?.ageMinutes).toBeGreaterThanOrEqual(40);
    expect(open[1]?.ageMinutes).toBe(0);

    // A lower ceiling: what was spent stays, nothing remains (never negative).
    await setImageCeiling(db.pool, 500_000n, TEST_AUTH);
    expect((await spend()) as { images: unknown }).toMatchObject({
      images: { revision: 2, ceilingMicros: '500000', spentMicros: '940833', remainingMicros: '0' },
    });
    // Zero stops every image call; the operator's settlement closes the orphan, whole.
    await setImageCeiling(db.pool, 0n, TEST_AUTH);
    await runOperatorCommand(
      db.pool,
      parseOperatorArgs([
        'image-reservation-settle',
        '--charge',
        orphaned,
        '--owner',
        TEST_AUTH.ownerId,
        '--authorized-on',
        TEST_AUTH.authorizedOn,
        '--authorization-source',
        TEST_AUTH.source,
      ]),
    );
    expect((await spend()) as { images: unknown }).toMatchObject({
      images: {
        revision: 3,
        ceilingMicros: '0',
        spentMicros: '940833',
        heldMicros: '200000',
        remainingMicros: '0',
        unsettled: 1,
        unsettledReservations: [{ chargeId: running }],
      },
    });
  });
});
