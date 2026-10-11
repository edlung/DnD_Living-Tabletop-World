import type { AiAttemptView, CommandProposal } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { runWithFallback, type AttemptProgress, type FallbackDeps } from './fallback.ts';
import { ProviderError, outputResponse, type RoutedProvider } from './providers.ts';
import { steppingMs, testBrand } from './testing/providers.ts';
import { validateProposal } from './validation.ts';

/**
 * The invocation boundary of the fallback policy (docs/adr/0032-live-ai.md, B1 repair 2). Code
 * the caller supplies (`build`, `validate`, `nowMs`, a progress listener) may throw. Before a
 * provider is invoked, the exception propagates and nothing is recorded; a delivered `start` is
 * withdrawn with `abandoned`. After an invocation, exactly one attempt is recorded with what the
 * provider actually did, its `end` is published once, and then the exception propagates. A
 * callback exception never becomes a provider attempt, a repair or a switch.
 */
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };
const INVALID = { summary: 'Nothing.', commands: [] };
const BOOM = new Error('callback failed');

/** A provider that counts invocations and answers with `answer` (an output or a thrown error). */
function counted(kind: 'remote' | 'local', answer: unknown = VALID) {
  const generate = vi.fn((_request: unknown, attempt: { onStart: () => void }) => {
    attempt.onStart();
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(outputResponse(answer, `${kind}-1`));
  });
  return { provider: testBrand(kind, kind, generate), generate };
}

/** Runs the policy, collecting progress; returns the settled outcome either way. */
async function run(
  providers: RoutedProvider[],
  extra: Partial<FallbackDeps<CommandProposal>> & {
    readonly listener?: (event: AttemptProgress, events: AttemptProgress['type'][]) => void;
  } = {},
) {
  const events: AttemptProgress['type'][] = [];
  const ends: AiAttemptView[] = [];
  const { listener, ...rest } = extra;
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
    onProgress: (event) => {
      events.push(event.type);
      if (event.type === 'end') ends.push(event.attempt);
      listener?.(event, events);
    },
    ...rest,
  };
  const settled = await runWithFallback(deps).then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  return { settled, events, ends };
}

/** Every `start` is closed by exactly one `abandoned` or `end`. */
function expectMatched(events: readonly AttemptProgress['type'][]) {
  let open = 0;
  for (const event of events) {
    if (event === 'start') {
      expect(open).toBe(0);
      open += 1;
    } else if (event === 'abandoned' || event === 'end') {
      expect(open).toBe(1);
      open -= 1;
    }
  }
  expect(open).toBe(0);
}

describe('callbacks before an invocation', () => {
  it.each([false, true])('propagates a throwing build (caller aborted: %s)', async (abort) => {
    const controller = new AbortController();
    const remote = counted('remote');
    const local = counted('local');
    const { settled, events, ends } = await run([remote.provider, local.provider], {
      signal: controller.signal,
      build: () => {
        if (abort) controller.abort();
        throw BOOM;
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).not.toHaveBeenCalled();
    expect(local.generate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(ends).toEqual([]);
  });

  it('propagates a throwing repair build: no fictitious repair, no switch', async () => {
    const remote = counted('remote', INVALID);
    const local = counted('local');
    let builds = 0;
    const { settled, events, ends } = await run([remote.provider, local.provider], {
      build: (repair) => {
        builds += 1;
        if (repair) throw BOOM;
        return {
          capability: 'reasoning',
          system: 's',
          prompt: 'p',
          output: { name: 'propose_commands', description: '', schema: {} },
          task: {
            kind: 'dm-intent',
            text: 't',
            context: { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
            repair,
          },
        };
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(builds).toBe(2);
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(local.generate).not.toHaveBeenCalled();
    expect(ends.map((a) => [a.kind, a.outcome])).toEqual([['initial', 'invalid']]);
    expectMatched(events);
  });

  it.each([false, true])(
    'withdraws a start whose notice throws, invoking nothing (caller aborted: %s)',
    async (abort) => {
      const controller = new AbortController();
      const remote = counted('remote');
      const local = counted('local');
      const { settled, events, ends } = await run([remote.provider, local.provider], {
        signal: controller.signal,
        listener: (event) => {
          if (event.type !== 'start') return;
          if (abort) controller.abort();
          throw BOOM;
        },
      });

      expect(settled).toEqual({ ok: false, error: BOOM });
      expect(remote.generate).not.toHaveBeenCalled();
      expect(local.generate).not.toHaveBeenCalled();
      expect(events).toEqual(['start', 'abandoned']);
      expect(ends).toEqual([]);
    },
  );

  it('propagates a throwing withdrawal after a start notice aborted the caller', async () => {
    const controller = new AbortController();
    const remote = counted('remote');
    const { settled, events, ends } = await run([remote.provider], {
      signal: controller.signal,
      listener: (event) => {
        if (event.type === 'start') controller.abort();
        if (event.type === 'abandoned') throw BOOM;
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).not.toHaveBeenCalled();
    expect(events).toEqual(['start', 'abandoned']);
    expect(ends).toEqual([]);
  });

  it('keeps the first error when both the start and its withdrawal throw', async () => {
    const remote = counted('remote');
    const { settled } = await run([remote.provider], {
      listener: (event) => {
        if (event.type === 'start') throw BOOM;
        if (event.type === 'abandoned') throw new Error('second');
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).not.toHaveBeenCalled();
  });
});

describe('callbacks after an invocation', () => {
  it.each([
    ['an outage', new ProviderError('UNAVAILABLE', 'down')],
    ['valid output', VALID],
    ['invalid output', INVALID],
  ])(
    'records one attempt when the end notice throws after %s, then propagates',
    async (_label, answer) => {
      const remote = counted('remote', answer);
      const local = counted('local');
      let endNotices = 0;
      const { settled, events } = await run([remote.provider, local.provider], {
        listener: (event) => {
          if (event.type !== 'end') return;
          endNotices += 1;
          throw BOOM;
        },
      });

      expect(settled).toEqual({ ok: false, error: BOOM });
      expect(remote.generate).toHaveBeenCalledTimes(1);
      expect(endNotices).toBe(1);
      expect(local.generate).not.toHaveBeenCalled();
      expectMatched(events);
    },
  );

  it('records the actual attempt when the dispatch notice throws, then propagates', async () => {
    const remote = counted('remote', INVALID);
    const local = counted('local');
    const { settled, events, ends } = await run([remote.provider, local.provider], {
      listener: (event) => {
        if (event.type === 'dispatched') throw BOOM;
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(local.generate).not.toHaveBeenCalled();
    expect(ends).toMatchObject([{ provider: 'remote', kind: 'initial', outcome: 'invalid' }]);
    expectMatched(events);
  });

  it('keeps safe metadata when validation throws after a response, then propagates', async () => {
    const remote = counted('remote');
    const local = counted('local');
    const { settled, events, ends } = await run([remote.provider, local.provider], {
      validate: () => {
        throw BOOM;
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(local.generate).not.toHaveBeenCalled();
    expect(ends).toEqual([
      expect.objectContaining({
        provider: 'remote',
        kind: 'initial',
        outcome: 'error',
        error: 'INTERNAL_ERROR',
        model: 'remote-1',
        output: null,
      }),
    ]);
    expectMatched(events);
  });

  it('keeps one attempt when the clock fails after an invocation, then propagates', async () => {
    const remote = counted('remote');
    let reads = 0;
    const { settled, ends } = await run([remote.provider], {
      nowMs: () => {
        reads += 1;
        if (reads > 1) throw BOOM;
        return 0;
      },
    });

    expect(settled).toEqual({ ok: false, error: BOOM });
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expect(ends).toHaveLength(1);
  });

  it('still records an invoked provider’s TRANSPORT_NOT_STARTED as a real attempt', async () => {
    const remote = counted('remote', new ProviderError('TRANSPORT_NOT_STARTED', 'not sent'));
    const local = counted('local');
    const { settled, events } = await run([remote.provider, local.provider]);

    expect(settled.ok && settled.result.status).toBe('VALID');
    expect(settled.ok && settled.result.attempts.map((a) => [a.provider, a.error])).toEqual([
      ['remote', 'TRANSPORT_NOT_STARTED'],
      ['local', null],
    ]);
    expect(remote.generate).toHaveBeenCalledTimes(1);
    expectMatched(events);
  });
});
