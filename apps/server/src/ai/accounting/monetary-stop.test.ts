import { describe, expect, it, vi } from 'vitest';

import type { Queryable } from './spend.ts';
import { stopDenies, type StopRow } from './stop-scope.ts';

const target = { accountId: 'acct', approvalId: 'a1', provider: 'anthropic', model: 'canonical' };
const valid: StopRow = {
  stop_id: 's1',
  reason: 'OVERRUN',
  approval_id: 'a1',
  provider: null,
  model: null,
  attempt_id: 'at1',
  source_account: 'acct',
  source_approval: 'a1',
  source_provider: 'anthropic',
  source_model: 'canonical',
  source_pricing: 'verified',
};
const resolve = (_provider: string, model: string) => (model === 'canonical' ? model : null);

function reader(row: StopRow): Queryable {
  return {
    query: vi.fn().mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [row],
    }) as Queryable['query'],
  };
}

describe('unlimited policy preserves nonmonetary stop protection', () => {
  it('supersedes only a fully resolved monetary overrun', async () => {
    expect(await stopDenies(reader(valid), target, resolve, false)).toBe(true);
    expect(await stopDenies(reader(valid), target, resolve, true)).toBe(false);
  });

  it.each([
    { provider: 'anthropic' },
    { attempt_id: null },
    { source_account: null },
    { source_account: 'other' },
    { source_approval: 'other' },
    { source_pricing: null },
    { source_model: 'unknown' },
    { reason: 'DISCREPANCY' },
    { reason: 'unknown-reason' },
  ])('still refuses corrupted or nonmonetary evidence %j', async (change) => {
    expect(await stopDenies(reader({ ...valid, ...change }), target, resolve, true)).toBe(true);
  });
});
