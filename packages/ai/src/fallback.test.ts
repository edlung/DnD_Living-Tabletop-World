import { describe, expect, it } from 'vitest';

import { runWithFallback, type FallbackDeps } from './fallback.ts';
import { ProviderError, type AiProvider, type RepairNote } from './providers.ts';
import { scripted, steppingMs } from './testing/providers.ts';
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
function deps(...providers: AiProvider[]): FallbackDeps {
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
  };
}

describe('runWithFallback', () => {
  it('returns a valid first answer with a single attempt', async () => {
    const result = await runWithFallback(deps(scripted('a', VALID), scripted('b', VALID)));

    expect(result.status).toBe('PROPOSED');
    expect(result.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
      ['a', 'initial', 'valid'],
    ]);
    expect(result.attempts[0]).toMatchObject({ model: 'a-model', latencyMs: 5, error: null });
  });

  it('repairs an invalid answer once on the same provider, with its issues and output', async () => {
    const a = scripted('a', UNKNOWN_REF, VALID);
    const b = scripted('b', VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('PROPOSED');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['a', 'initial', 'invalid'],
      ['a', 'repair', 'valid'],
    ]);
    expect(result.attempts[0]?.issues).toEqual(['commands.0.entityId: unknown entity "nobody"']);
    expect(a.requests[1]?.task.repair).toEqual({
      output: UNKNOWN_REF,
      issues: ['commands.0.entityId: unknown entity "nobody"'],
    });
    expect(a.requests[1]?.task.context).toBe(a.requests[0]?.task.context);
    expect(b.requests).toHaveLength(0);
  });

  it('reports INVALID_OUTPUT after one failed repair and calls nothing else', async () => {
    const a = scripted('a', INVALID, UNKNOWN_REF, VALID);
    const b = scripted('b', VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result).toMatchObject({
      status: 'INVALID_OUTPUT',
      issues: ['commands.0.entityId: unknown entity "nobody"'],
    });
    expect(result).not.toHaveProperty('proposal');
    expect(result.attempts.map((x) => x.kind)).toEqual(['initial', 'repair']);
    expect(a.requests).toHaveLength(2);
    expect(b.requests).toHaveLength(0);
  });

  it('switches once to the next provider with the identical request on failure', async () => {
    const a = scripted('a', new ProviderError('TIMEOUT', 'timed out'));
    const b = scripted('b', VALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('PROPOSED');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome, x.error])).toEqual([
      ['a', 'initial', 'error', 'TIMEOUT'],
      ['b', 'fallback', 'valid', null],
    ]);
    expect(b.requests[0]).toEqual(a.requests[0]);
    expect(result.attempts[0]).toMatchObject({ model: null, output: null, usage: null });
  });

  it('reports AI_UNAVAILABLE when the fallback fails too, and never tries a third', async () => {
    const c = scripted('c', VALID);
    const result = await runWithFallback(
      deps(
        scripted('a', new ProviderError('UNAVAILABLE', 'down')),
        scripted('b', new Error('boom')),
        c,
      ),
    );

    expect(result.status).toBe('AI_UNAVAILABLE');
    expect(result.attempts.map((x) => [x.provider, x.error])).toEqual([
      ['a', 'UNAVAILABLE'],
      ['b', 'UNAVAILABLE'],
    ]);
    expect(c.requests).toHaveLength(0);
  });

  it('reports AI_UNAVAILABLE with no provider or a single failing one', async () => {
    expect(await runWithFallback(deps())).toEqual({ status: 'AI_UNAVAILABLE', attempts: [] });
    const single = await runWithFallback(
      deps(scripted('a', new ProviderError('BAD_RESPONSE', 'garbled'))),
    );
    expect(single.status).toBe('AI_UNAVAILABLE');
    expect(single.attempts.map((x) => x.error)).toEqual(['BAD_RESPONSE']);
  });

  it('allows one switch and one repair in the same request, no more', async () => {
    const b = scripted('b', INVALID, VALID);
    const result = await runWithFallback(deps(scripted('a', new Error('down')), b));

    expect(result.status).toBe('PROPOSED');
    expect(result.attempts.map((x) => [x.provider, x.kind])).toEqual([
      ['a', 'initial'],
      ['b', 'fallback'],
      ['b', 'repair'],
    ]);
  });

  it('does not repair across a switch: a fresh provider starts from the original request', async () => {
    const a = scripted('a', INVALID, new ProviderError('TIMEOUT', 'slow'));
    const b = scripted('b', INVALID);
    const result = await runWithFallback(deps(a, b));

    expect(result.status).toBe('INVALID_OUTPUT');
    expect(result.attempts.map((x) => [x.provider, x.kind, x.outcome])).toEqual([
      ['a', 'initial', 'invalid'],
      ['a', 'repair', 'error'],
      ['b', 'fallback', 'invalid'],
    ]);
    expect(b.requests[0]?.task.repair).toBeNull();
    expect(b.requests[0]).toEqual(a.requests[0]);
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
});
