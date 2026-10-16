import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
 * effective-charge definition of `spend.ts`; read-only.
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
    });
  });

  it('is empty without operator records, and takes no flags', async () => {
    expect(await spend()).toEqual({ day: await databaseDay(db.pool), accounts: [], approvals: [] });
    expect(() => parseOperatorArgs(['spend', '--account', 'acct'])).toThrow(/does not take/);
  });
});
