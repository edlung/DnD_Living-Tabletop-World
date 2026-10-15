import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { preflight, type PreflightReads } from './eval-live.ts';

/**
 * Live evaluation preflight (design §4; ADR 0032, checkpoint C repair 1): a failing database read
 * at any step is the fixed refusal `DATABASE_UNAVAILABLE`, never a thrown error and never mistaken
 * for an absent approval or run; the pool is closed on every refusal. Real-database refusals:
 * `eval-live.integration.test.ts`.
 */
const ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://never@127.0.0.1:1/none',
  ANTHROPIC_API_KEY: 'sk-never',
};
const REQUEST = {
  approvalId: 'a1',
  runId: 'r1',
  model: 'anthropic:claude-sonnet-5-5',
  capabilities: ['reasoning'] as const,
};
const failing = () => Promise.reject(new Error('connection terminated'));

function rig(reads: Partial<PreflightReads>) {
  const end = vi.fn(() => Promise.resolve());
  const pool = { end } as unknown as pg.Pool;
  const all: PreflightReads = {
    probe: () => Promise.resolve(),
    approvalStored: () => Promise.resolve(true),
    run: () => Promise.resolve({ approval_id: 'a1', campaign_id: 'ravenford' }),
    ...reads,
  };
  return { run: () => preflight(REQUEST, ENV, () => pool, all), end };
}

describe('live evaluation preflight reads', () => {
  it.each([
    ['the probe', { probe: failing }],
    ['the approval read', { approvalStored: failing }],
    ['the run read', { run: failing }],
  ])('refuses as DATABASE_UNAVAILABLE when %s fails, closing the pool', async (_label, reads) => {
    const { run, end } = rig(reads);
    await expect(run()).resolves.toEqual({ ok: false, reason: 'DATABASE_UNAVAILABLE' });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['APPROVAL_NOT_STORED', { approvalStored: () => Promise.resolve(false) }],
    ['RUN_NOT_REGISTERED', { run: () => Promise.resolve(null) }],
    [
      'RUN_BOUND_ELSEWHERE',
      { run: () => Promise.resolve({ approval_id: 'a2', campaign_id: 'ravenford' }) },
    ],
    [
      'RUN_BOUND_ELSEWHERE',
      { run: () => Promise.resolve({ approval_id: 'a1', campaign_id: 'elsewhere' }) },
    ],
  ] as const)('refuses with %s, closing the pool', async (reason, reads) => {
    const { run, end } = rig(reads);
    await expect(run()).resolves.toEqual({ ok: false, reason });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('binds an existing approval and its registered run', async () => {
    const { run, end } = rig({});
    await expect(run()).resolves.toMatchObject({
      ok: true,
      binding: { approvalId: 'a1', runId: 'r1', campaignId: 'ravenford' },
    });
    expect(end).not.toHaveBeenCalled();
  });
});
