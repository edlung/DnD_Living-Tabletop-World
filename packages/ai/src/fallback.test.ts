import type { CommandProposal } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { runWithFallback, type FallbackDeps } from './fallback.ts';
import { ProviderError, type RepairNote, type RoutedProvider } from './providers.ts';
import {
  denied,
  intentTaskOf,
  refusal,
  scripted,
  scriptedLocal,
  steppingMs,
  payloadOf,
  suspect,
  testAccounting,
} from './testing/providers.ts';
import { validateProposal } from './validation.ts';

/**
 * The owner's fallback policy (ADR 0017 §5): on failure, the next provider
 * once with the identical request; on invalid output, one repair; at most one
 * of each; nothing committable unless valid.
 */
const VALID = { summary: 'Advance an hour.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };
const INVALID = { summary: 'Nothing.', commands: [] };
const UNKNOWN_REF = {
  summary: 'Kill someone unknown.',
  commands: [{ type: 'ChangeEntityStatus', entityId: 'nobody', status: 'dead' }],
};

const CONTEXT = { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 };

/** Requests carry the repair note verbatim so tests can see what each attempt was given. */
function deps(...providers: RoutedProvider[]): FallbackDeps<CommandProposal> {
  return {
    providers,
    build: (repair: RepairNote | null) => ({
      capability: 'reasoning',
      system: 'system',
      prompt: repair ? `prompt + repair ${repair.issues.join('; ')}` : 'prompt',
      output: { name: 'propose_commands', description: '', schema: {} },
      task: {
        kind: 'dm-intent',
        text: 'text',
        context: CONTEXT,
        repair,
      },
    }),
    validate: (output) => validateProposal(output, new Set(['north-gate'])),
    nowMs: steppingMs(),
    accounting: testAccounting(),
  };
}

describe('runWithFallback', () => {
  it('returns a valid first answer with a single attempt', async () => {
    const result = await runWithFallback(deps(scripted('a', VALID), scriptedLocal(VALID)));

    expect(result.status).toBe('VALID');
    expect(result.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
      ['a', 'initial', 'valid'],
    ]);
    expect(result.attempts[0]).toMatchObject({ model: 'a-model', latencyMs: 5, error: null });
  });

  it('repairs an invalid answer once on the same provider, with its issues and output', async () => {
    const a = scripted('a', UNKNOWN_REF, VALID);
    const b = scriptedLocal(VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('VALID');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['a', 'initial', 'invalid'],
      ['a', 'repair', 'valid'],
    ]);
    expect(result.attempts[0]?.issues).toEqual(['commands.0.entityId: unknown entity "nobody"']);
    expect(a.requests[1]?.task.repair).toEqual({
      output: UNKNOWN_REF,
      issues: ['commands.0.entityId: unknown entity "nobody"'],
    });
    expect(intentTaskOf(a.requests[1]).context).toBe(intentTaskOf(a.requests[0]).context);
    expect(b.requests).toHaveLength(0);
  });

  it('reports INVALID_OUTPUT after one failed repair and calls nothing else', async () => {
    const a = scripted('a', INVALID, UNKNOWN_REF, VALID);
    const b = scriptedLocal(VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result).toMatchObject({
      status: 'INVALID_OUTPUT',
      code: 'INVALID_STRUCTURED_OUTPUT',
      issues: ['commands.0.entityId: unknown entity "nobody"'],
    });
    expect(result).not.toHaveProperty('value');
    expect(result.attempts.map((x) => x.kind)).toEqual(['initial', 'repair']);
    expect(a.requests).toHaveLength(2);
    expect(b.requests).toHaveLength(0);
  });

  it('switches once to the local provider with the identical request on failure', async () => {
    const a = scripted('a', new ProviderError('TIMEOUT', 'timed out'));
    const b = scriptedLocal(VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('VALID');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome, x.error])).toEqual([
      ['a', 'initial', 'error', 'TIMEOUT'],
      ['local', 'fallback', 'valid', null],
    ]);
    expect(payloadOf(b.requests[0])).toEqual(payloadOf(a.requests[0]));
    expect(result.attempts[0]).toMatchObject({ model: null, output: null, usage: null });
  });

  it('reports AI_UNAVAILABLE when the fallback fails too, and never tries a third', async () => {
    const c = scriptedLocal(VALID);
    const result = await runWithFallback(
      deps(
        scripted('a', new ProviderError('UNAVAILABLE', 'down')),
        scriptedLocal(new Error('boom')),
        c,
      ),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'PROVIDER_FAILURE' });
    expect(result.attempts.map((x) => [x.provider, x.error])).toEqual([
      ['a', 'UNAVAILABLE'],
      ['local', 'UNAVAILABLE'],
    ]);
    expect(c.requests).toHaveLength(0);
  });

  it('never switches to a second paid provider', async () => {
    const b = scripted('b', VALID);
    const result = await runWithFallback(
      deps(scripted('a', new ProviderError('UNAVAILABLE', 'down')), b),
    );

    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code: 'PROVIDER_FAILURE' });
    expect(b.requests).toHaveLength(0);
  });

  it('reports AI_UNAVAILABLE with no provider or a single failing one', async () => {
    expect(await runWithFallback(deps())).toEqual({
      status: 'AI_UNAVAILABLE',
      code: null,
      attempts: [],
    });
    const single = await runWithFallback(
      deps(scripted('a', new ProviderError('BAD_RESPONSE', 'garbled'))),
    );
    expect(single.status).toBe('AI_UNAVAILABLE');
    expect(single.attempts.map((x) => x.error)).toEqual(['BAD_RESPONSE']);
  });

  it('allows one repair and one switch in the same request, no more', async () => {
    const a = scripted('a', INVALID, new ProviderError('TIMEOUT', 'slow'));
    const b = scriptedLocal(VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('VALID');
    expect(result.attempts.map((x) => [x.provider, x.kind])).toEqual([
      ['a', 'initial'],
      ['a', 'repair'],
      ['local', 'fallback'],
    ]);
  });

  it('never repairs the local provider: a local-only route makes one attempt', async () => {
    const local = scriptedLocal(INVALID, VALID);
    const result = await runWithFallback(deps(local));

    expect(result).toMatchObject({ status: 'INVALID_OUTPUT', code: 'INVALID_STRUCTURED_OUTPUT' });
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['local', 'initial', 'invalid'],
    ]);
    expect(local.requests).toHaveLength(1);
  });

  it('keeps the switched local provider’s invalid output: one local call', async () => {
    const local = scriptedLocal(INVALID, VALID);
    const result = await runWithFallback(deps(scripted('a', new Error('down')), local));

    expect(result).toMatchObject({ status: 'INVALID_OUTPUT', code: 'INVALID_STRUCTURED_OUTPUT' });
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['a', 'initial', 'error'],
      ['local', 'fallback', 'invalid'],
    ]);
    expect(local.requests).toHaveLength(1);
  });

  it('does not repair across a switch: a fresh provider starts from the original request', async () => {
    const a = scripted('a', INVALID, new ProviderError('TIMEOUT', 'slow'));
    const b = scriptedLocal(INVALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('INVALID_OUTPUT');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['a', 'initial', 'invalid'],
      ['a', 'repair', 'error'],
      ['local', 'fallback', 'invalid'],
    ]);
    expect(b.requests[0]?.task.repair).toBeNull();
    expect(payloadOf(b.requests[0])).toEqual(payloadOf(a.requests[0]));
  });

  it('records raw output cut at 8 KB, and never an error message', async () => {
    const huge = { summary: 'x'.repeat(20_000), commands: [] };
    const result = await runWithFallback(
      deps(scripted('a', huge, new ProviderError('UNAVAILABLE', 'secret detail sk-ant-123'))),
    );

    expect(result.attempts[0]?.output?.length).toBe(8 * 1024 + 1);
    expect(result.attempts[0]?.output?.endsWith('…')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret detail');
  });

  it.each([
    ['a refusal', refusal(), 'PROVIDER_REFUSAL'],
    ['an unexpected model', suspect('UNEXPECTED_MODEL'), 'UNEXPECTED_MODEL'],
    ['a budget denial', denied('BUDGET_DENIED'), 'BUDGET_DENIED'],
    ['an outage', new ProviderError('UNAVAILABLE', 'down'), 'PROVIDER_FAILURE'],
  ] as const)('keeps the code of %s when the local switch fails too', async (_l, step, code) => {
    const result = await runWithFallback(
      deps(scripted('a', step), scriptedLocal(new ProviderError('UNAVAILABLE', 'down'))),
    );
    expect(result).toMatchObject({ status: 'AI_UNAVAILABLE', code });
    expect(result.attempts).toHaveLength(2);
  });
});
