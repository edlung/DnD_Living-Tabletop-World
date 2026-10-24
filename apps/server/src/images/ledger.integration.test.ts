import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseOperatorArgs } from '../ai/accounting/operator-args.ts';
import { runOperatorCommand } from '../ai/accounting/operator-commands.ts';
import { Secret } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { TEST_AUTH, accountingDb, type AccountingDb } from '../testing/accounting.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import {
  IMAGE_LEDGER_LOCK_KEY,
  PostgresImageLedger,
  imageBudgetStatus,
  setImageCeiling,
  type ImageCharge,
} from './ledger.ts';
import { createOpenRouterImageGenerator } from './openrouter-generator.ts';
import { NO_STYLE_REFERENCES } from './style-references.ts';

/**
 * The image ledger on PostgreSQL (migration 0011; docs/adr/0035-images.md §2): no stored ceiling
 * or a zero ceiling admits nothing, a reservation precedes every call and settles once, history is
 * append-only, competing jobs cannot both pass a nearly full ceiling, and the operator CLI is the
 * only path that stores a ceiling.
 */
let db: AccountingDb;
let ledger: PostgresImageLedger;
beforeEach(async () => {
  db = await accountingDb();
  ledger = new PostgresImageLedger(db.pool);
});
afterEach(async () => {
  await db.close();
});

const charge = (reserveMicros: bigint, requestId = 'r#0'): ImageCharge => ({
  chargeId: randomUUID(),
  campaignId: 'ravenford',
  requestId,
  provider: 'openrouter-openai',
  model: 'openai/gpt-5.4-image-2',
  reserveMicros,
});

const spent = async () => (await imageBudgetStatus(db.pool)).spentMicros;

describe('the image ceiling', () => {
  it('admits nothing without a stored ceiling, or with a zero one', async () => {
    expect(await ledger.reserve(charge(1n))).toBe('no-budget');
    await setImageCeiling(db.pool, 0n, TEST_AUTH);
    expect(await ledger.reserve(charge(1n))).toBe('ceiling');
    expect((await imageBudgetStatus(db.pool)).charges).toBe(0);
  });

  it('reserves up to the ceiling, settles to the reported cost, and frees what was not spent', async () => {
    await setImageCeiling(db.pool, 1_000_000n, TEST_AUTH);
    const first = charge(500_000n);
    const second = charge(500_000n);
    expect(await ledger.reserve(first)).toBe('reserved');
    expect(await ledger.reserve(second)).toBe('reserved');
    expect(await ledger.reserve(charge(1n))).toBe('ceiling');
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '1000000',
      heldMicros: '1000000',
      remainingMicros: '0',
      charges: 2,
      unsettled: 2,
    });

    await ledger.settle(first.chargeId, {
      outcome: 'generated',
      costMicros: 41_200n,
      returnedModel: 'openai/gpt-5.4-image-2',
      providerRequestId: 'gen-1',
    });
    // Settled again (a retry): nothing changes.
    await ledger.settle(first.chargeId, {
      outcome: 'failed',
      costMicros: 1n,
      returnedModel: null,
      providerRequestId: null,
    });
    expect(await spent()).toBe('541200');
    // The cost of the second is unknown: its whole reservation stays.
    await ledger.settle(second.chargeId, {
      outcome: 'timeout',
      costMicros: null,
      returnedModel: null,
      providerRequestId: null,
    });
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '541200',
      heldMicros: '0',
      remainingMicros: '458800',
      unsettled: 0,
    });
    expect(await ledger.reserve(charge(458_800n))).toBe('reserved');
    expect(await ledger.reserve(charge(1n))).toBe('ceiling');

    const rows = await db.pool.query<{ outcome: string; charged: string; reported: boolean }>(
      `SELECT outcome, charged_micros::text AS charged, cost_reported AS reported
       FROM ltw_image_settlements ORDER BY created_at`,
    );
    expect(rows.rows).toEqual([
      { outcome: 'generated', charged: '41200', reported: true },
      { outcome: 'timeout', charged: '500000', reported: false },
    ]);
  });

  it('releases a reservation that was never sent, and records a raised ceiling as a revision', async () => {
    await setImageCeiling(db.pool, 500_000n, TEST_AUTH);
    const unsent = charge(500_000n);
    expect(await ledger.reserve(unsent)).toBe('reserved');
    await ledger.settle(unsent.chargeId, {
      outcome: 'not-sent',
      costMicros: 123n,
      returnedModel: null,
      providerRequestId: null,
    });
    expect(await spent()).toBe('0');
    expect(await setImageCeiling(db.pool, 5_000_000n, TEST_AUTH)).toBe(2);
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      revision: 2,
      ceilingMicros: '5000000',
      remainingMicros: '5000000',
    });
  });

  it('is append-only', async () => {
    await setImageCeiling(db.pool, 1_000_000n, TEST_AUTH);
    const reserved = charge(1_000n);
    await ledger.reserve(reserved);
    await ledger.settle(reserved.chargeId, {
      outcome: 'generated',
      costMicros: 10n,
      returnedModel: null,
      providerRequestId: null,
    });
    for (const statement of [
      'UPDATE ltw_image_budget SET ceiling_micros = 99999999',
      'DELETE FROM ltw_image_budget',
      'UPDATE ltw_image_charges SET reserved_micros = 1',
      'DELETE FROM ltw_image_settlements',
      'TRUNCATE ltw_image_charges CASCADE',
    ]) {
      await expect(db.pool.query(statement), statement).rejects.toThrow();
    }
  });
});

describe('competing jobs', () => {
  it('cannot both pass a nearly full ceiling', async () => {
    await setImageCeiling(db.pool, 1_000_000n, TEST_AUTH);
    expect(await ledger.reserve(charge(400_000n))).toBe('reserved');
    const other = new PostgresImageLedger(db.pool2());
    for (let round = 0; round < 5; round += 1) {
      const before = await spent();
      const results = await Promise.all([
        ledger.reserve(charge(400_000n)),
        other.reserve(charge(400_000n)),
      ]);
      if (before === '400000') {
        expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
      } else {
        expect(results).toEqual(['ceiling', 'ceiling']);
      }
    }
    expect(await spent()).toBe('800000');
  });

  it('wait for the one ledger lock: a reservation does not pass while another holds it', async () => {
    await setImageCeiling(db.pool, 1_000_000n, TEST_AUTH);
    const holder = await db.pool2().connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock($1::bigint)', [
        IMAGE_LEDGER_LOCK_KEY.toString(),
      ]);
      let settled = false;
      const pending = ledger.reserve(charge(1_000n)).then((result) => {
        settled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      await holder.query('COMMIT');
      expect(await pending).toBe('reserved');
    } finally {
      holder.release();
    }
  });

  it('admit exactly as many as fit when many race at once', async () => {
    await setImageCeiling(db.pool, 1_000_000n, TEST_AUTH);
    const pools = [db.pool, db.pool2(), db.pool2()].map((pool) => new PostgresImageLedger(pool));
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (pools[index % pools.length] ?? ledger).reserve(charge(250_000n, `r${String(index)}#0`)),
      ),
    );
    expect(results.filter((result) => result === 'reserved')).toHaveLength(4);
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '1000000',
      charges: 4,
    });
  });
});

describe('the operator CLI', () => {
  const AUTH = [
    '--owner',
    'owner',
    '--authorized-on',
    '2026-10-15',
    '--authorization-source',
    'q6',
  ];

  it('stores the ceiling with its authorization, and shows the counters', async () => {
    expect(
      await runOperatorCommand(
        db.pool,
        parseOperatorArgs(['image-budget-set', '--micros', '5000000', ...AUTH]),
      ),
    ).toEqual({ imageBudgetRevision: 1 });
    const stored = await db.pool.query(
      `SELECT revision, ceiling_micros::text AS ceiling, owner_id, authorized_on::text AS on,
              authorization_source AS source FROM ltw_image_budget`,
    );
    expect(stored.rows).toEqual([
      { revision: 1, ceiling: '5000000', owner_id: 'owner', on: '2026-10-15', source: 'q6' },
    ]);
    const status = (await runOperatorCommand(db.pool, parseOperatorArgs(['status']))) as {
      images: unknown;
    };
    expect(status.images).toEqual({
      revision: 1,
      ceilingMicros: '5000000',
      spentMicros: '0',
      heldMicros: '0',
      remainingMicros: '5000000',
      charges: 0,
      unsettled: 0,
    });
    // Zero stops every image call.
    await runOperatorCommand(
      db.pool,
      parseOperatorArgs(['image-budget-set', '--micros', '0', ...AUTH]),
    );
    expect(await ledger.reserve(charge(1n))).toBe('ceiling');
  });
});

describe('the generator on the ledger', () => {
  it('spends only within the stored ceiling and records the reported cost', async () => {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#806040' },
    })
      .png()
      .toBuffer();
    const transport = fakeFetch(() =>
      jsonResponse({
        id: 'gen-9',
        model: 'openai/gpt-5.4-image-2',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              images: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
                },
              ],
            },
          },
        ],
        usage: { cost: 0.0525 },
      }),
    );
    const generator = createOpenRouterImageGenerator({
      apiKey: new Secret('sk-or-v1-TEST-ONLY-ledger'),
      model: 'openai/gpt-5.4-image-2',
      ledger,
      styleReferences: NO_STYLE_REFERENCES,
      timeoutMs: 5_000,
      logger: createLogger({ service: 'images-it', level: 'silent' }),
      fetch: transport.fetchImpl,
    });
    const brief = {
      seed: 'x#0',
      subject: { entityId: 'tomas-reed', kind: 'npc', name: 'Tomas', description: 'A guard.' },
      variant: 'reference' as const,
      purpose: 'image' as const,
      label: null,
      note: null,
      basedOn: null,
      reference: null,
    };
    const job = { campaignId: 'ravenford', requestId: 'x#0' };
    await expect(generator.generate(brief, undefined, job)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(transport.calls).toHaveLength(0);

    await setImageCeiling(db.pool, 550_000n, TEST_AUTH);
    expect((await generator.generate(brief, undefined, job)).mediaType).toBe('image/webp');
    expect(await imageBudgetStatus(db.pool)).toMatchObject({
      spentMicros: '52500',
      remainingMicros: '497500',
      charges: 1,
      unsettled: 0,
    });
    // The next call would need a whole worst case, which no longer fits.
    await expect(generator.generate(brief, undefined, job)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(transport.calls).toHaveLength(1);
  });
});
