import { describe, expect, it } from 'vitest';

import { runWithFallback, type AttemptProgress } from './fallback.ts';
import { ProviderError, outputResponse, type AttemptContext } from './providers.ts';
import { scriptedLocal, steppingMs, testAccounting, testBrand } from './testing/providers.ts';

/**
 * The provider's start hook (docs/adr/0032-live-ai.md, B2; B1 Opus max finding 2): it counts once,
 * only while its own attempt runs. A repeated call is ignored, and a call after the attempt settled
 * (from a provider that kept the callback) never reaches a later attempt's window or drops an error.
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

function run(
  providers: Parameters<typeof runWithFallback>[0]['providers'],
  onProgress?: (event: AttemptProgress) => void,
) {
  const events: string[] = [];
  return {
    events,
    result: runWithFallback({
      providers,
      build,
      validate: () => ({ ok: true, value: VALID }),
      nowMs: steppingMs(),
      accounting: testAccounting(),
      onProgress: (event) => {
        events.push(event.type === 'start' ? `start:${event.provider}` : event.type);
        onProgress?.(event);
      },
    }),
  };
}

describe('the start hook', () => {
  it('publishes one dispatch however often a provider calls it', async () => {
    const twice = testBrand('remote', 'remote', (_request, attempt) => {
      attempt.onStart();
      attempt.onStart();
      attempt.onStart();
      return Promise.resolve(outputResponse(VALID, 'm'));
    });
    const { events, result } = run([twice]);
    expect((await result).status).toBe('VALID');
    expect(events).toEqual(['start:remote', 'dispatched', 'end']);
  });

  it('ignores an earlier attempt’s hook once that attempt has settled', async () => {
    let kept: AttemptContext | null = null;
    const failing = testBrand('remote', 'remote', (_request, attempt) => {
      kept = attempt;
      attempt.onStart();
      return Promise.reject(new ProviderError('UNAVAILABLE', 'down'));
    });
    const local = testBrand('local', 'local', () => {
      // The finished remote attempt's callback, called from inside the local attempt's window.
      kept?.onStart();
      return Promise.resolve(outputResponse(VALID, 'local'));
    });
    let thrown = 0;
    const { events, result } = run([failing, local], (event) => {
      if (event.type === 'dispatched') {
        thrown += 1;
        throw new Error('listener');
      }
    });
    // The live dispatch listener error propagates after its attempt is recorded (B1 repair 2).
    await expect(result).rejects.toThrow('listener');
    expect(events).toEqual(['start:remote', 'dispatched', 'end']);
    expect(thrown).toBe(1);
  });

  it('never lets a stale hook mark a later attempt as dispatched', async () => {
    let kept: AttemptContext | null = null;
    const failing = testBrand('remote', 'remote', (_request, attempt) => {
      kept = attempt;
      return Promise.reject(new ProviderError('UNAVAILABLE', 'down'));
    });
    const local = testBrand('local', 'local', () => {
      kept?.onStart();
      return Promise.resolve(outputResponse(VALID, 'local'));
    });
    const { events, result } = run([failing, local]);
    expect((await result).status).toBe('VALID');
    expect(events).toEqual(['start:remote', 'end', 'start:local', 'end']);
  });

  it('gives each invocation the whole request deadline', async () => {
    const seen: number[] = [];
    const local = scriptedLocal(VALID);
    const remote = testBrand('remote', 'remote', (_request, attempt) => {
      seen.push(attempt.deadlineAtMs);
      return Promise.reject(new ProviderError('UNAVAILABLE', 'down'));
    });
    await runWithFallback({
      providers: [remote, local],
      build,
      validate: () => ({ ok: true, value: VALID }),
      nowMs: steppingMs(),
      accounting: testAccounting(),
      deadlineAtMs: 1234,
    });
    expect(seen).toEqual([1234]);
  });
});
