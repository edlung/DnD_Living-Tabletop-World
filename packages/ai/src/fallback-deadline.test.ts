import { describe, expect, it } from 'vitest';

import { runWithFallback } from './fallback.ts';
import { ProviderError, outputResponse, type ProviderResponse } from './providers.ts';
import { spinUntil } from './testing/journal.ts';
import { scriptedLocal, steppingMs, testAccounting, testBrand } from './testing/providers.ts';

/**
 * The whole-request deadline is a monotonic instant, not only an abort signal (docs/adr/0032-
 * live-ai.md, B2 repair 1): the signal is set by a timer that can run late. Once
 * `performance.now()` reaches `deadlineAtMs`, the policy invokes nothing more (the local provider
 * included) and selects no late result, whether or not the signal has fired yet.
 */
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };
const build = () =>
  ({
    capability: 'reasoning',
    system: 'system',
    prompt: 'prompt',
    output: { name: 'propose_commands', description: '', schema: {} },
    task: {
      kind: 'dm-intent',
      text: 't',
      context: { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
      repair: null,
    },
  }) as const;

/** A remote provider that answers only after the deadline has passed (the signal still live). */
const late = (answer: () => Promise<ProviderResponse>) =>
  testBrand('remote', 'remote', (_request, attempt) => {
    attempt.onStart();
    spinUntil(attempt.deadlineAtMs);
    return answer();
  });

const run = (
  remote: ReturnType<typeof late>,
  local = scriptedLocal(VALID),
  deadlineAtMs?: number,
) =>
  runWithFallback({
    providers: [remote, local],
    build,
    validate: () => ({ ok: true, value: VALID }),
    nowMs: steppingMs(),
    accounting: testAccounting(),
    deadlineAtMs: deadlineAtMs ?? performance.now() + 15,
  });

describe('the fallback policy at the monotonic deadline', () => {
  it.each([
    [
      'an admission denial',
      () => Promise.resolve<ProviderResponse>({ kind: 'denied', code: 'ADMISSION_UNAVAILABLE' }),
    ],
    ['an outage', () => Promise.reject(new ProviderError('UNAVAILABLE', 'down'))],
    [
      'a refusal',
      () =>
        Promise.resolve<ProviderResponse>({
          kind: 'refusal',
          model: 'm',
          usage: null,
          billing: null,
          providerRequestId: null,
        }),
    ],
  ])('never switches to the local provider after %s answered late', async (_label, answer) => {
    const local = scriptedLocal(VALID);
    const result = await run(late(answer), local);
    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(local.requests).toEqual([]);
    expect(result.attempts.map((a) => a.provider)).toEqual(['remote']);
  });

  it('selects no output that arrives after the deadline', async () => {
    const result = await run(late(() => Promise.resolve(outputResponse(VALID, 'm'))));
    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts).toMatchObject([
      { outcome: 'error', error: 'CALLER_CANCELLED', output: null },
    ]);
  });

  it('invokes nothing when the deadline has already passed', async () => {
    const remote = scriptedLocal(VALID);
    const result = await runWithFallback({
      providers: [remote],
      build,
      validate: () => ({ ok: true, value: VALID }),
      nowMs: steppingMs(),
      accounting: testAccounting(),
      deadlineAtMs: performance.now() - 1,
    });
    expect(result).toEqual({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED', attempts: [] });
    expect(remote.requests).toEqual([]);
  });
});
