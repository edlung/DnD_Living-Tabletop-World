import { describe, expect, it } from 'vitest';

import { StorageUnavailable } from './pg-transaction.ts';
import { SETTLEMENT_RETRY_DELAYS_MS, settleWithRetry } from './settlement.ts';
import { AccountingRejection } from './types.ts';

/** Known usage whose settlement fails keeps its hold and retries at 100, 500 and 2,000 ms only. */
describe('settleWithRetry', () => {
  const failing = (failures: number) => {
    let calls = 0;
    return {
      calls: () => calls,
      settle: () => {
        calls += 1;
        return calls <= failures
          ? Promise.reject(new StorageUnavailable('timeout'))
          : Promise.resolve('settled' as const);
      },
    };
  };

  it('retries after 100, 500 and 2,000 ms, then leaves the hold for the operator', async () => {
    const slept: number[] = [];
    const attempt = failing(10);
    const result = await settleWithRetry(attempt.settle, {
      shutdown: new AbortController().signal,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(result).toBe('held');
    expect(slept).toEqual([...SETTLEMENT_RETRY_DELAYS_MS]);
    expect(attempt.calls()).toBe(4);
  });

  it('stops on success, and on shutdown without another attempt', async () => {
    const attempt = failing(1);
    expect(
      await settleWithRetry(attempt.settle, {
        shutdown: new AbortController().signal,
        sleep: () => Promise.resolve(),
      }),
    ).toBe('settled');
    expect(attempt.calls()).toBe(2);

    const stopping = new AbortController();
    const stopped = failing(10);
    const result = await settleWithRetry(stopped.settle, {
      shutdown: stopping.signal,
      sleep: () => {
        stopping.abort();
        return Promise.resolve();
      },
    });
    expect(result).toBe('held');
    expect(stopped.calls()).toBe(1);
  });

  it('does not retry a refusal', async () => {
    await expect(
      settleWithRetry(() => Promise.reject(new AccountingRejection('INVALID_CHARGE')), {
        shutdown: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CHARGE' });
  });
});
