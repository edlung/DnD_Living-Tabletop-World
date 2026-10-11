import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { deadlineIn } from './deadline.ts';
import { StorageUnavailable, readCommitted } from './pg-transaction.ts';

/**
 * Every database wait of a transaction is bounded by its absolute deadline (Sol P1, checkpoint A
 * acceptance): timeout settings, BEGIN, SHOW, application SQL, COMMIT and cleanup. A fake driver
 * delays chosen statements; nothing here touches a database.
 */
interface Issued {
  readonly sql: string;
  readonly atMs: number;
}

/** Errors by statement prefix; a plain list fails with a definite server ERROR (22012). */
type Failing = readonly string[] | Readonly<Record<string, Readonly<Record<string, string>>>>;

function fakeDriver(delays: Readonly<Record<string, number>>, failing: Failing = []) {
  const errors: Readonly<Record<string, Readonly<Record<string, string>>>> = Array.isArray(failing)
    ? Object.fromEntries(
        (failing as readonly string[]).map((prefix) => [
          prefix,
          { code: '22012', severity: 'ERROR' },
        ]),
      )
    : (failing as Readonly<Record<string, Readonly<Record<string, string>>>>);
  const started = performance.now();
  const issued: Issued[] = [];
  const released: unknown[] = [];
  const client = {
    query(sql: string) {
      issued.push({ sql, atMs: performance.now() - started });
      const delay = Object.entries(delays).find(([prefix]) => sql.startsWith(prefix))?.[1] ?? 0;
      const rows = sql.startsWith('SHOW') ? [{ transaction_isolation: 'read committed' }] : [];
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          const error = Object.entries(errors).find(([prefix]) => sql.startsWith(prefix))?.[1];
          if (error !== undefined) {
            reject(Object.assign(new Error('server error'), error));
          } else {
            resolve({ rows, rowCount: rows.length });
          }
        }, delay),
      );
    },
    release(error?: unknown) {
      released.push(error ?? null);
    },
  };
  return {
    pool: { connect: () => Promise.resolve(client) } as unknown as pg.Pool,
    issued: () => issued.map((entry) => entry.sql),
    released,
    elapsed: () => performance.now() - started,
  };
}

const SETTINGS = 'SELECT set_config';
const APP = 'SELECT 1 AS application';
const settle = (ms: number) => new Promise((done) => setTimeout(done, ms));
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => error,
  );

describe('readCommitted deadlines', () => {
  it('never issues application SQL after a delayed timeout-settings response', async () => {
    const driver = fakeDriver({ [SETTINGS]: 400 });
    const error = await failure(readCommitted(driver.pool, deadlineIn(40), (tx) => tx.query(APP)));
    expect(error).toBeInstanceOf(StorageUnavailable);
    expect(error).toMatchObject({ reason: 'timeout', commitUnknown: false });
    expect(driver.elapsed()).toBeLessThan(300);
    await settle(450);
    expect(driver.issued()).not.toContain(APP);
    expect(driver.issued()).not.toContain('COMMIT');
    expect(driver.released).toHaveLength(1);
    expect(driver.released[0]).toBeTruthy();
  });

  it('bounds a stalled BEGIN and issues nothing after it', async () => {
    const driver = fakeDriver({ BEGIN: 400 });
    const error = await failure(readCommitted(driver.pool, deadlineIn(40), (tx) => tx.query(APP)));
    expect(error).toMatchObject({ reason: 'timeout', commitUnknown: false });
    expect(driver.elapsed()).toBeLessThan(300);
    await settle(450);
    expect(driver.issued()).toEqual(['BEGIN ISOLATION LEVEL READ COMMITTED']);
    expect(driver.released[0]).toBeTruthy();
  });

  it('bounds a stalled isolation check', async () => {
    const driver = fakeDriver({ SHOW: 400 });
    const error = await failure(readCommitted(driver.pool, deadlineIn(40), (tx) => tx.query(APP)));
    expect(error).toMatchObject({ reason: 'timeout' });
    expect(driver.elapsed()).toBeLessThan(300);
    await settle(450);
    expect(driver.issued()).not.toContain(APP);
  });

  it('reports a stalled COMMIT as unknown, not as success or as a confirmed rollback', async () => {
    const driver = fakeDriver({ COMMIT: 400 });
    const error = await failure(readCommitted(driver.pool, deadlineIn(60), (tx) => tx.query(APP)));
    expect(error).toBeInstanceOf(StorageUnavailable);
    expect(error).toMatchObject({ reason: 'timeout', commitUnknown: true });
    expect(driver.elapsed()).toBeLessThan(300);
    await settle(450);
    expect(driver.issued()).not.toContain('ROLLBACK');
    expect(driver.released[0]).toBeTruthy();
  });

  it('never waits for cleanup: a failed transaction is destroyed, not rolled back at leisure', async () => {
    const driver = fakeDriver({ ROLLBACK: 1_000 }, [APP]);
    const error = await failure(
      readCommitted(driver.pool, deadlineIn(2_000), (tx) => tx.query(APP)),
    );
    expect(error).toMatchObject({ reason: 'failure', commitUnknown: false });
    expect(driver.elapsed()).toBeLessThan(500);
    expect(driver.released[0]).toBeTruthy();
  });

  it('runs and commits normally within the deadline, releasing the client for reuse', async () => {
    const driver = fakeDriver({});
    const result = await readCommitted(driver.pool, deadlineIn(1_000), async (tx) => {
      await tx.query(APP);
      return 'done';
    });
    expect(result).toBe('done');
    expect(driver.issued()).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      'SHOW transaction_isolation',
      `${SETTINGS}('statement_timeout', $1, true), set_config('lock_timeout', $1, true)`,
      APP,
      'COMMIT',
    ]);
    expect(driver.released).toEqual([null]);
  });

  it('evaluates statement parameters only after the settings response', async () => {
    const driver = fakeDriver({ [SETTINGS]: 60 });
    const started = performance.now();
    let evaluatedAt = -1;
    await readCommitted(driver.pool, deadlineIn(1_000), (tx) =>
      tx.query(APP, () => {
        evaluatedAt = performance.now() - started;
        return [];
      }),
    );
    expect(evaluatedAt).toBeGreaterThanOrEqual(55);
  });
});

/**
 * A COMMIT that was sent and answered with an error clears the commit-unknown flag only on
 * definite rollback evidence: an ERROR-severity answer with a SQLSTATE that means the transaction
 * was aborted. Connection failures, unknown resolution, shutdown and internal errors stay unknown.
 */
describe('COMMIT error classification', () => {
  const commitFailing = (error: Readonly<Record<string, string>>) =>
    failure(
      readCommitted(fakeDriver({}, { COMMIT: error }).pool, deadlineIn(1_000), (tx) =>
        tx.query(APP),
      ),
    );

  it.each([
    { code: '08007', severity: 'FATAL' },
    { code: '08006', severity: 'FATAL' },
    { code: '57P01', severity: 'FATAL' },
    { code: 'XX000', severity: 'ERROR' },
    { code: '40003', severity: 'ERROR' },
    { code: '40001', severity: 'FATAL' },
    { code: '40001' },
    { code: '22012', severity: 'ERROR' },
  ])('keeps an answered COMMIT unknown for $code ($severity)', async (answer) => {
    expect(await commitFailing(answer)).toMatchObject({ commitUnknown: true });
  });

  it.each([
    { code: '40001', severity: 'ERROR' },
    { code: '40P01', severity: 'ERROR' },
    { code: '23505', severity: 'ERROR' },
  ])('treats $code at ERROR severity as a definite rollback', async (answer) => {
    const error = await commitFailing(answer);
    expect(error).not.toMatchObject({ commitUnknown: true });
  });

  it('maps the finalizer window guard to a definite window-closed rejection', async () => {
    expect(await commitFailing({ code: 'LT001', severity: 'ERROR' })).toMatchObject({
      name: 'AccountingRejection',
      code: 'WINDOW_CLOSED',
    });
  });
});

describe('Tx.clamp', () => {
  it('lowers the deadline for every later wait, including COMMIT, and never raises it', async () => {
    const driver = fakeDriver({ COMMIT: 400 });
    const error = await failure(
      readCommitted(driver.pool, deadlineIn(2_000), async (tx) => {
        await tx.query(APP);
        tx.clamp(deadlineIn(5_000));
        tx.clamp(deadlineIn(60));
      }),
    );
    expect(error).toMatchObject({ reason: 'timeout', commitUnknown: true });
    expect(driver.elapsed()).toBeLessThan(300);
  });
});
