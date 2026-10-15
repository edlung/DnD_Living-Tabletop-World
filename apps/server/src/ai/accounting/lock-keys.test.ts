import { describe, expect, it } from 'vitest';

import {
  POLICY_LOCK_KEY,
  bucketLockKey,
  requestLockKey,
  scopeBuckets,
  sortedLockKeys,
  type AttemptScope,
} from './lock-keys.ts';

const MAX_BIGINT = (1n << 63n) - 1n;
const scope: AttemptScope = {
  accountId: 'acct',
  approvalId: 'appr',
  campaignId: 'ravenford',
  sessionClass: 'play',
  sessionId: 's1',
  day: '2026-10-11',
};

describe('advisory lock keys', () => {
  it('keeps buckets nonnegative 63-bit and requests below the policy key', () => {
    for (const bucket of scopeBuckets(scope)) {
      const key = bucketLockKey(bucket);
      expect(key).toBeGreaterThanOrEqual(0n);
      expect(key).toBeLessThanOrEqual(MAX_BIGINT);
    }
    for (const id of ['00000000-0000-4000-8000-000000000000', crypto.randomUUID()]) {
      const key = requestLockKey(id);
      expect(key).toBeLessThanOrEqual(-2n);
      expect(key).toBeGreaterThanOrEqual(-(1n << 63n));
    }
    expect(POLICY_LOCK_KEY).toBe(-1n);
  });

  it('distinguishes bucket identities that a naive join would confuse', () => {
    const a = bucketLockKey({ kind: 'campaign-day', campaignId: 'a-b', day: 'c' });
    const b = bucketLockKey({ kind: 'campaign-day', campaignId: 'a', day: 'b-c' });
    expect(a).not.toBe(b);
    expect(bucketLockKey({ kind: 'stage', approvalId: 'x' })).not.toBe(
      bucketLockKey({ kind: 'account-control', accountId: 'x' }),
    );
  });

  it('orders a scope’s locks numerically, without duplicates', () => {
    const keys = sortedLockKeys([...scopeBuckets(scope), ...scopeBuckets(scope)]);
    expect(keys).toHaveLength(5);
    expect([...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(keys);
  });

  it('gives the account-control lock no date, so it spans midnight', () => {
    const today = sortedLockKeys(scopeBuckets(scope));
    const tomorrow = sortedLockKeys(scopeBuckets({ ...scope, day: '2026-10-12' }));
    const control = bucketLockKey({ kind: 'account-control', accountId: 'acct' });
    expect(today).toContain(control);
    expect(tomorrow).toContain(control);
  });
});
