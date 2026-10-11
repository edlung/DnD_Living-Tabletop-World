import type { CommandProposal } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  runWithFallback,
  type AttemptProgress,
  type FallbackDeps,
  type OutputCheck,
} from './fallback.ts';
import { ProviderError, outputResponse, type RoutedProvider } from './providers.ts';
import { scripted, scriptedLocal, steppingMs, testBrand } from './testing/providers.ts';
import { validateProposal } from './validation.ts';

/**
 * The caller's whole-request signal in the fallback policy (docs/adr/0032-live-ai.md, B1): once it
 * aborts nothing new is dispatched (no repair, no switch, not even local), late output is
 * discarded, and an attempt timeout that coincides with it is CALLER_CANCELLED. While the caller
 * still waits, an attempt's own timeout is an ordinary failure that may switch to local. Attempt
 * starts are published synchronously, so a caller that stops waiting knows what was in flight.
 */
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };
const INVALID = { summary: 'Nothing.', commands: [] };

function deps(
  providers: RoutedProvider[],
  extra: Partial<FallbackDeps<CommandProposal>> = {},
): FallbackDeps<CommandProposal> {
  return {
    providers,
    build: (repair) => ({
      capability: 'reasoning',
      system: 'system',
      prompt: 'prompt',
      output: { name: 'propose_commands', description: '', schema: {} },
      task: {
        kind: 'dm-intent',
        text: 'text',
        context: { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
        repair,
      },
    }),
    validate: (output) => validateProposal(output, new Set()),
    nowMs: steppingMs(),
    ...extra,
  };
}

/** A remote provider that answers once the caller has aborted, as `answer` says. */
function abortingDuring(controller: AbortController, answer: () => unknown) {
  return testBrand('remote', 'remote', (_request, attempt) => {
    attempt.onStart();
    controller.abort();
    const value = answer();
    return value instanceof Promise ? value : Promise.resolve(outputResponse(value, 'remote-1'));
  });
}

describe('runWithFallback and the caller signal', () => {
  it('dispatches nothing once the caller has gone', async () => {
    const controller = new AbortController();
    controller.abort();
    const remote = scripted('remote', VALID);
    const local = scriptedLocal(VALID);
    const result = await runWithFallback(deps([remote, local], { signal: controller.signal }));

    expect(result).toEqual({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED', attempts: [] });
    expect(remote.requests).toHaveLength(0);
    expect(local.requests).toHaveLength(0);
  });

  it.each([
    ['the caller’s own abort', 'CALLER_CANCELLED'],
    ['an attempt timeout coinciding with it', 'TIMEOUT'],
    ['an outage reported after it', 'UNAVAILABLE'],
  ] as const)('ends CALLER_CANCELLED on %s, with no switch', async (_label, code) => {
    const controller = new AbortController();
    const local = scriptedLocal(VALID);
    const remote = abortingDuring(controller, () => Promise.reject(new ProviderError(code, 'x')));
    const result = await runWithFallback(deps([remote, local], { signal: controller.signal }));

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts).toMatchObject([{ outcome: 'error', error: 'CALLER_CANCELLED' }]);
    expect(local.requests).toHaveLength(0);
  });

  it('keeps TRANSPORT_NOT_STARTED as the attempt code: the release proof', async () => {
    const controller = new AbortController();
    const remote = testBrand('remote', 'remote', () => {
      controller.abort();
      return Promise.reject(new ProviderError('TRANSPORT_NOT_STARTED', 'aborted before'));
    });
    const result = await runWithFallback(
      deps([remote, scriptedLocal(VALID)], { signal: controller.signal }),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts.map((a) => a.error)).toEqual(['TRANSPORT_NOT_STARTED']);
  });

  it('discards output that arrives after the caller has gone, keeping safe metadata', async () => {
    const controller = new AbortController();
    const validate = vi.fn((output: unknown) => validateProposal(output, new Set()));
    const remote = abortingDuring(controller, () => VALID);
    const result = await runWithFallback(
      deps([remote, scriptedLocal(VALID)], { signal: controller.signal, validate }),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts).toMatchObject([
      { outcome: 'error', error: 'CALLER_CANCELLED', output: null, model: 'remote-1' },
    ]);
    expect(validate).not.toHaveBeenCalled();
  });

  it('does not repair after the caller has gone', async () => {
    const controller = new AbortController();
    const remote = scripted('remote', INVALID, VALID);
    const result = await runWithFallback(
      deps([remote], {
        signal: controller.signal,
        validate: (output) => {
          controller.abort();
          return validateProposal(output, new Set());
        },
      }),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(remote.requests).toHaveLength(1);
    expect(result.attempts).toMatchObject([{ error: 'CALLER_CANCELLED', output: null }]);
  });

  const terminalDecline = (): OutputCheck<CommandProposal> => ({
    ok: false,
    issues: ['NO_PROPOSAL'],
    decline: 'not_game',
  });
  const plain = (): OutputCheck<CommandProposal> | undefined => undefined;
  it.each([
    ['a valid output', VALID, plain],
    ['a valid terminal decline', { kind: 'decline', reason: 'not_game' }, terminalDecline],
  ] as const)(
    'cancels, rather than returns, %s when validation aborts the caller (B1 repair 2)',
    async (_label, output, check) => {
      const controller = new AbortController();
      const remote = scripted('remote', output, VALID);
      const local = scriptedLocal(VALID);
      const result = await runWithFallback(
        deps([remote, local], {
          signal: controller.signal,
          declines: true,
          validate: (value) => {
            controller.abort();
            return check() ?? validateProposal(value, new Set());
          },
        }),
      );

      expect(result).toEqual({
        status: 'AI_UNAVAILABLE',
        code: 'CALLER_CANCELLED',
        attempts: [
          expect.objectContaining({
            provider: 'remote',
            kind: 'initial',
            outcome: 'error',
            error: 'CALLER_CANCELLED',
            output: null,
            model: 'remote-model',
          }),
        ],
      });
      expect(result).not.toHaveProperty('value');
      expect(result).not.toHaveProperty('decline');
      expect(remote.requests).toHaveLength(1);
      expect(local.requests).toHaveLength(0);
    },
  );

  it('switches to local on an attempt timeout while the caller still waits', async () => {
    const controller = new AbortController();
    const local = scriptedLocal(VALID);
    const result = await runWithFallback(
      deps([scripted('remote', new ProviderError('TIMEOUT', 'slow')), local], {
        signal: controller.signal,
      }),
    );

    expect(result.status).toBe('VALID');
    expect(result.attempts.map((a) => [a.provider, a.error])).toEqual([
      ['remote', 'TIMEOUT'],
      ['local', null],
    ]);
  });
});

describe('attempt progress', () => {
  it('publishes each start before awaiting the provider, then dispatch and end', async () => {
    const events: AttemptProgress['type'][] = [];
    let release: (value: unknown) => void = () => undefined;
    const slow = testBrand('remote', 'remote', (_request, attempt) => {
      attempt.onStart();
      return new Promise((resolve) => {
        release = () => {
          resolve(outputResponse(VALID, 'remote-1'));
        };
      });
    });
    const running = runWithFallback(
      deps([slow], { onProgress: (event) => events.push(event.type) }),
    );

    expect(events).toEqual(['start', 'dispatched']);
    release(undefined);
    expect((await running).status).toBe('VALID');
    expect(events).toEqual(['start', 'dispatched', 'end']);
  });

  it('reports a switch as two starts', async () => {
    const events: AttemptProgress[] = [];
    await runWithFallback(
      deps([scripted('remote', new ProviderError('UNAVAILABLE', 'down')), scriptedLocal(VALID)], {
        onProgress: (event) => events.push(event),
      }),
    );

    expect(
      events.flatMap((event) => (event.type === 'start' ? [[event.provider, event.kind]] : [])),
    ).toEqual([
      ['remote', 'initial'],
      ['local', 'fallback'],
    ]);
  });
});

describe('cancellation from a callback before an invocation (B1 repair 1)', () => {
  /** A provider that counts invocations and would answer validly. */
  const counted = (kind: 'remote' | 'local') => {
    const generate = vi.fn(() => Promise.resolve(outputResponse(VALID, `${kind}-1`)));
    return { provider: testBrand(kind, kind, generate), generate };
  };

  it('invokes nothing when the start notice aborts the caller', async () => {
    const controller = new AbortController();
    const remote = counted('remote');
    const local = counted('local');
    const events: AttemptProgress['type'][] = [];
    const result = await runWithFallback(
      deps([remote.provider, local.provider], {
        signal: controller.signal,
        onProgress: (event) => {
          events.push(event.type);
          if (event.type === 'start') controller.abort();
        },
      }),
    );

    expect(result).toEqual({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED', attempts: [] });
    expect(remote.generate).not.toHaveBeenCalled();
    expect(local.generate).not.toHaveBeenCalled();
    expect(events).toEqual(['start', 'abandoned']);
  });

  it('invokes nothing when building the request aborts the caller', async () => {
    const controller = new AbortController();
    const remote = counted('remote');
    const base = deps([remote.provider]);
    const result = await runWithFallback({
      ...base,
      signal: controller.signal,
      build: (repair) => {
        controller.abort();
        return base.build(repair);
      },
    });

    expect(result).toEqual({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED', attempts: [] });
    expect(remote.generate).not.toHaveBeenCalled();
  });

  it('builds no repair request once building it aborted the caller', async () => {
    const controller = new AbortController();
    const remote = scripted('remote', INVALID, VALID);
    const base = deps([remote]);
    const result = await runWithFallback({
      ...base,
      signal: controller.signal,
      build: (repair) => {
        if (repair) controller.abort();
        return base.build(repair);
      },
    });

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(remote.requests).toHaveLength(1);
  });

  it('does not switch to local when the failed attempt’s end notice aborts the caller', async () => {
    const controller = new AbortController();
    const local = counted('local');
    const result = await runWithFallback(
      deps([scripted('remote', new ProviderError('UNAVAILABLE', 'down')), local.provider], {
        signal: controller.signal,
        onProgress: (event) => {
          if (event.type === 'end') controller.abort();
        },
      }),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts.map((a) => a.error)).toEqual(['UNAVAILABLE']);
    expect(local.generate).not.toHaveBeenCalled();
  });

  it('discards the answer when the dispatch notice aborts the caller', async () => {
    const controller = new AbortController();
    const local = counted('local');
    const result = await runWithFallback(
      deps([scripted('remote', INVALID, VALID), local.provider], {
        signal: controller.signal,
        onProgress: (event) => {
          if (event.type === 'dispatched') controller.abort();
        },
      }),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
    expect(result.attempts).toMatchObject([{ error: 'CALLER_CANCELLED', output: null }]);
    expect(local.generate).not.toHaveBeenCalled();
  });
});
