import type { AiAttemptView, CommandProposal } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { runWithFallback, type AttemptProgress, type FallbackDeps } from './fallback.ts';
import {
  ProviderError,
  outputResponse,
  type ProviderErrorCode,
  type ProviderResponse,
  type RoutedProvider,
} from './providers.ts';
import { steppingMs, testBrand } from './testing/providers.ts';
import { validateProposal } from './validation.ts';

/**
 * An invoked provider that rejects with an unknown, unreadable or forged error (docs/adr/0032-live-
 * ai.md, B1 repair 4): it is still that invocation's one attempt, closed by its `end`, with the
 * conservative code `UNAVAILABLE` and no model, usage or output, then the ordinary provider-failure
 * transition (one switch to local), or `CALLER_CANCELLED` once the caller has gone. Only a genuine
 * `ProviderError` keeps `TRANSPORT_NOT_STARTED`.
 */
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };

const withCode = (descriptor: PropertyDescriptor) => {
  const error = new ProviderError('TIMEOUT', 'x');
  Object.defineProperty(error, 'code', descriptor);
  return error;
};

/** Fresh rejection reasons, made per test so a revoked Proxy is revoked for that run. */
const REJECTIONS: readonly (readonly [string, () => unknown])[] = [
  [
    'a ProviderError whose code getter throws',
    () =>
      withCode({
        get: () => {
          throw new Error('code unreadable');
        },
      }),
  ],
  [
    'a revoked Proxy',
    () => {
      const handle = Proxy.revocable(new ProviderError('TRANSPORT_NOT_STARTED', 'x'), {});
      handle.revoke();
      return handle.proxy;
    },
  ],
  [
    'a Proxy whose prototype read throws',
    () =>
      new Proxy(new ProviderError('TIMEOUT', 'x'), {
        getPrototypeOf: () => {
          throw new Error('no prototype');
        },
      }),
  ],
  ['a ProviderError with an unknown code', () => withCode({ value: 'INVENTED_CODE' })],
  ['a ProviderError with a non-string code', () => withCode({ value: 42 })],
  ['a plain object claiming no transport', () => ({ code: 'TRANSPORT_NOT_STARTED' })],
  [
    'a prototype look-alike claiming no transport',
    () =>
      Object.assign(Object.create(ProviderError.prototype) as object, {
        code: 'TRANSPORT_NOT_STARTED',
      }),
  ],
];

/** A provider that is invoked, signals its start, optionally lets the caller go, then rejects. */
function rejecting(reason: () => unknown, before?: () => void) {
  const generate = vi.fn((_request: unknown, attempt: { onStart: () => void }) => {
    attempt.onStart();
    before?.();
    // Rejects with exactly `reason()`, whatever it is.
    return Promise.resolve().then((): ProviderResponse => {
      throw reason();
    });
  });
  return { provider: testBrand('remote', 'remote', generate), generate };
}

function localValid() {
  const generate = vi.fn(() => Promise.resolve(outputResponse(VALID, 'local-1')));
  return { provider: testBrand('local', 'local', generate), generate };
}

async function run(providers: RoutedProvider[], signal?: AbortSignal) {
  const events: AttemptProgress['type'][] = [];
  const ends: AiAttemptView[] = [];
  const deps: FallbackDeps<CommandProposal> = {
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
    ...(signal ? { signal } : {}),
    onProgress: (event) => {
      events.push(event.type);
      if (event.type === 'end') ends.push(event.attempt);
    },
  };
  const result = await runWithFallback(deps);
  return { result, events, ends };
}

const UNKNOWN = { provider: 'remote', kind: 'initial', outcome: 'error', model: null, usage: null };

describe('an invoked provider that rejects with an unknown or unreadable error', () => {
  it.each(REJECTIONS)('records %s once as UNAVAILABLE, then switches once', async (_l, reason) => {
    const remote = rejecting(reason);
    const local = localValid();
    const { result, events, ends } = await run([remote.provider, local.provider]);

    expect(result.status).toBe('VALID');
    expect(result.attempts).toEqual([
      expect.objectContaining({ ...UNKNOWN, error: 'UNAVAILABLE', output: null }),
      expect.objectContaining({ provider: 'local', kind: 'fallback', outcome: 'valid' }),
    ]);
    expect(ends).toEqual(result.attempts);
    expect(events).toEqual(['start', 'dispatched', 'end', 'start', 'end']);
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(local.generate).toHaveBeenCalledTimes(1);
  });

  it.each(REJECTIONS)('cancels on %s once the caller has gone', async (_l, reason) => {
    const caller = new AbortController();
    const remote = rejecting(reason, () => {
      caller.abort();
    });
    const local = localValid();
    const { result, events } = await run([remote.provider, local.provider], caller.signal);

    expect(result).toEqual({
      status: 'AI_UNAVAILABLE',
      code: 'CALLER_CANCELLED',
      attempts: [expect.objectContaining({ ...UNKNOWN, error: 'CALLER_CANCELLED' })],
    });
    expect(local.generate).not.toHaveBeenCalled();
    expect(events).toEqual(['start', 'dispatched', 'end']);
  });
});

describe('an invoked provider that rejects with a genuine ProviderError', () => {
  it.each(['UNAVAILABLE', 'TIMEOUT', 'BAD_RESPONSE', 'TRANSPORT_NOT_STARTED'] as const)(
    'records %s as it is, then switches once',
    async (code: ProviderErrorCode) => {
      const remote = rejecting(() => new ProviderError(code, 'x'));
      const local = localValid();
      const { result } = await run([remote.provider, local.provider]);

      expect(result.status).toBe('VALID');
      expect(result.attempts.map((a) => [a.provider, a.error])).toEqual([
        ['remote', code],
        ['local', null],
      ]);
    },
  );

  it('keeps a genuine TRANSPORT_NOT_STARTED once the caller has gone, and nothing else', async () => {
    for (const [reason, expected] of [
      [() => new ProviderError('TRANSPORT_NOT_STARTED', 'x'), 'TRANSPORT_NOT_STARTED'],
      [() => ({ code: 'TRANSPORT_NOT_STARTED' }), 'CALLER_CANCELLED'],
    ] as const) {
      const caller = new AbortController();
      const remote = rejecting(reason, () => {
        caller.abort();
      });
      const { result } = await run([remote.provider, localValid().provider], caller.signal);

      expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'CALLER_CANCELLED' });
      expect(result.attempts.map((a) => a.error)).toEqual([expected]);
    }
  });
});
