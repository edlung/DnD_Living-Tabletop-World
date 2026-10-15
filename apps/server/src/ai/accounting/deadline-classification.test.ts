import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_RESOLVE, admission } from '../../testing/accounting.ts';
import { admit } from './admission.ts';
import { deadlineIn } from './deadline.ts';
import { startRequest } from './request-journal.ts';

/**
 * A storage wait bounded by the request's own deadline that times out is the request expiring,
 * whatever the clock reads at that moment (docs/STAGE_300_REMEDIATION_DESIGN.md §1–2). Node's
 * timers can fire a little before `performance.now()` reaches the deadline they were set for; the
 * classification must not depend on that race. Here the clock is made to lag the timers, which is
 * the race forced to its worst case. A pool that never hands out a client makes the checkout wait
 * end only by its timer; nothing touches a database.
 */
const never = { connect: () => new Promise<never>(() => undefined) } as unknown as pg.Pool;

/** From `afterMs` on, `performance.now()` reads `lagMs` behind real time. */
function lagClock(afterMs: number, lagMs: number): void {
  const real = performance.now.bind(performance);
  let lag = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => real() - lag);
  setTimeout(() => {
    lag = lagMs;
  }, afterMs);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a storage wait that ends at the request deadline', () => {
  it('denies admission as the caller cancelling, not as storage unavailable', async () => {
    const deadline = deadlineIn(60);
    lagClock(20, 15);
    const result = await admit(
      never,
      admission('00000000-0000-4000-8000-0000000000a1', 1n),
      deadline,
      TEST_RESOLVE,
    );
    expect(result).toMatchObject({ code: 'CALLER_CANCELLED' });
  });

  it('fails the request start as the caller cancelling, not as storage unavailable', async () => {
    const deadline = deadlineIn(60);
    lagClock(20, 15);
    const outcome = await startRequest(
      never,
      {
        requestId: '00000000-0000-4000-8000-0000000000a2',
        campaignId: 'ravenford',
        actorId: 'dm',
        purpose: 'dm-intent',
        capability: 'reasoning',
        scope: 'PUBLIC',
        sourceIds: [],
        approvalId: null,
        session: null,
        configuredModel: null,
      },
      deadline,
    );
    expect(outcome).toEqual({ status: 'failed', reason: 'CALLER_CANCELLED' });
  });

  it('still reports storage unavailable when the 5 s storage step, not the request, timed out', async () => {
    // The request has far longer than the 5,000 ms step; only the step's own bound can end the wait.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const deadline = deadlineIn(60_000);
      const pending = admit(
        never,
        admission('00000000-0000-4000-8000-0000000000a3', 1n),
        deadline,
        TEST_RESOLVE,
      );
      await vi.advanceTimersByTimeAsync(5_001);
      expect(await pending).toMatchObject({ code: 'ADMISSION_UNAVAILABLE' });
    } finally {
      vi.useRealTimers();
    }
  });
});
