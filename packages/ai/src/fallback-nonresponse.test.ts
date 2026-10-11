import type { AiAttemptView, CommandProposal } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { runWithFallback, type AttemptProgress, type FallbackDeps } from './fallback.ts';
import { outputResponse, type ProviderResponse, type RoutedProvider } from './providers.ts';
import { steppingMs, testBrand } from './testing/providers.ts';
import { validateProposal } from './validation.ts';

/**
 * A provider that was invoked but resolved something other than a well-formed response
 * (docs/adr/0032-live-ai.md, B1 repair 3): `undefined`, `null`, a primitive, an unknown kind or
 * code, or a value whose reading throws. It is one uncertain `BAD_RESPONSE` attempt with no model,
 * usage or output, closed by its `end`, followed by the ordinary provider-failure transition (one
 * switch to local), or `CALLER_CANCELLED` once the caller has gone. Nothing trustworthy is invented.
 */
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };

/** Resolves as a value (no `then`), but reading any field of it throws. */
const unreadable = new Proxy(
  {},
  {
    get: (_target, property) => {
      if (property === 'then') return undefined;
      throw new Error('unreadable');
    },
  },
);

const NON_RESPONSES: readonly (readonly [string, unknown])[] = [
  ['undefined', undefined],
  ['null', null],
  ['a number', 42],
  ['a string', 'Here is my proposal.'],
  ['an array', [VALID]],
  ['an unknown kind', { kind: 'weird', output: VALID, model: 'm', usage: null }],
  ['no kind', { output: VALID, model: 'm', usage: null }],
  ['a denial with an unknown code', { kind: 'denied', code: 'NOPE' }],
  ['a malformed answer with an unknown code', { kind: 'malformed', code: 'X', model: 'm' }],
  ['a suspect answer with an unknown code', { kind: 'suspect', code: 'X', model: 'm' }],
  ['an object whose reading throws', unreadable],
];

/** A provider that is invoked (and signals its start), then resolves `value`. */
function resolving(kind: 'remote' | 'local', value: () => unknown, before?: () => void) {
  const generate = vi.fn((_request: unknown, attempt: { onStart: () => void }) => {
    attempt.onStart();
    before?.();
    return Promise.resolve(value() as ProviderResponse);
  });
  return { provider: testBrand(kind, kind, generate), generate };
}

const localValid = () => resolving('local', () => outputResponse(VALID, 'local-1'));

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

const UNCERTAIN = {
  provider: 'remote',
  kind: 'initial',
  outcome: 'error',
  error: 'BAD_RESPONSE',
  model: null,
  usage: null,
  output: null,
  issues: [],
};

describe('an invoked provider that resolves a non-response', () => {
  it.each(NON_RESPONSES)(
    'records %s as one uncertain attempt, then switches once',
    async (_l, value) => {
      const remote = resolving('remote', () => value);
      const local = localValid();
      const { result, events, ends } = await run([remote.provider, local.provider]);

      expect(result.status).toBe('VALID');
      expect(result.attempts).toEqual([
        expect.objectContaining(UNCERTAIN),
        expect.objectContaining({ provider: 'local', kind: 'fallback', outcome: 'valid' }),
      ]);
      expect(ends).toEqual(result.attempts);
      expect(events).toEqual(['start', 'dispatched', 'end', 'start', 'dispatched', 'end']);
      expect(remote.generate).toHaveBeenCalledTimes(1);
      expect(local.generate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(NON_RESPONSES)(
    'ends a remote-only route on %s as a provider failure',
    async (_l, value) => {
      const remote = resolving('remote', () => value);
      const { result, events } = await run([remote.provider]);

      expect(result).toEqual({
        status: 'AI_UNAVAILABLE',
        code: 'PROVIDER_FAILURE',
        attempts: [expect.objectContaining(UNCERTAIN)],
      });
      expect(events).toEqual(['start', 'dispatched', 'end']);
    },
  );

  it('records a local non-response once and never repairs it', async () => {
    const local = resolving('local', () => undefined);
    const { result, events } = await run([local.provider]);

    expect(result).toEqual({
      status: 'AI_UNAVAILABLE',
      code: 'PROVIDER_FAILURE',
      attempts: [expect.objectContaining({ ...UNCERTAIN, provider: 'local' })],
    });
    expect(local.generate).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['start', 'dispatched', 'end']);
  });

  it.each([
    ['undefined', undefined],
    ['an unknown kind', { kind: 'weird' }],
  ])('cancels on %s once the caller has gone, with no switch', async (_l, value) => {
    const caller = new AbortController();
    const remote = resolving(
      'remote',
      () => value,
      () => {
        caller.abort();
      },
    );
    const local = localValid();
    const { result, events } = await run([remote.provider, local.provider], caller.signal);

    expect(result).toEqual({
      status: 'AI_UNAVAILABLE',
      code: 'CALLER_CANCELLED',
      attempts: [expect.objectContaining({ ...UNCERTAIN, error: 'CALLER_CANCELLED' })],
    });
    expect(local.generate).not.toHaveBeenCalled();
    expect(events).toEqual(['start', 'dispatched', 'end']);
  });

  it('keeps no ill-formed model or usage from an otherwise valid response', async () => {
    const remote = resolving('remote', () => ({
      kind: 'output',
      output: VALID,
      model: 42,
      usage: { inputTokens: -1, outputTokens: 2 },
      billing: null,
      providerRequestId: null,
    }));
    const { result } = await run([remote.provider]);

    expect(result.status).toBe('VALID');
    expect(result.attempts).toEqual([
      expect.objectContaining({ outcome: 'valid', model: null, usage: null }),
    ]);
  });

  it('keeps well-formed safe metadata of a classified response', async () => {
    const remote = resolving('remote', () => ({
      kind: 'refusal',
      model: 'remote-1',
      usage: { inputTokens: 10, outputTokens: 2 },
      billing: null,
      providerRequestId: null,
    }));
    const { result } = await run([remote.provider, localValid().provider]);

    expect(result.attempts[0]).toMatchObject({
      error: 'PROVIDER_REFUSAL',
      model: 'remote-1',
      usage: { inputTokens: 10, outputTokens: 2 },
    });
  });
});
