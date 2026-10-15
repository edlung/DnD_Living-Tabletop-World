import type { ChronicleTraceView, DmIntentTraceView } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { ProviderError, type RoutedProvider } from './providers.ts';
import {
  CAPABILITIES,
  capabilityHarness,
  validOutput,
  type Capability,
  type CapabilityRun,
} from './testing/capabilities.ts';
import {
  denied,
  malformed,
  refusal,
  scripted,
  scriptedLocal,
  suspect,
  type ScriptedProvider,
} from './testing/providers.ts';

/**
 * The outcome table of docs/adr/0032-live-ai.md (checkpoint B1;
 * docs/STAGE_300_REMEDIATION_DESIGN.md §3) through each use case: provider failures switch at most
 * once, only to the zero-cost local provider; invalid output is repaired once on the same remote
 * and never switches; a denied repair ends INVALID_OUTPUT; relevance never runs local AI.
 */
let run: Awaited<ReturnType<typeof capabilityHarness>>;
beforeAll(async () => {
  run = await capabilityHarness();
});

const SWITCHING = ['intent', 'dialogue', 'chronicle'] as const;
const LOCAL_VALID = { intent: 'PROPOSED', dialogue: 'REPLIED', chronicle: 'RENDERED' } as const;
const REMOTE_VALID: Record<Capability, string> = { ...LOCAL_VALID, relevance: 'RANKED' };
const INVALID = { nonsense: true };
const USAGE = { inputTokens: 10, outputTokens: 2 };
const ZERO = { inputTokens: 0, outputTokens: 0 };
const DENIALS: readonly string[] = ['BUDGET_DENIED', 'ADMISSION_DISABLED', 'ADMISSION_UNAVAILABLE'];

/** The public "nothing usable" result of each capability. */
function expectNoResult(capability: Capability, outcome: CapabilityRun) {
  if (capability === 'chronicle') expect(outcome.result).toBe('template');
  else if (capability === 'relevance') expect(outcome.result).toBe('deterministic');
  else expect(outcome.result).toBeNull();
}

const routeOf = (capability: Capability, remote: ScriptedProvider) => (local: RoutedProvider) =>
  capability === 'relevance' ? [remote] : [remote, local];

const FAILURES = [
  ['a refusal', () => refusal(), 'PROVIDER_REFUSAL', true],
  ['an outage', () => new ProviderError('UNAVAILABLE', 'down'), 'UNAVAILABLE', false],
  ['a 4xx', () => new ProviderError('BAD_RESPONSE', '400'), 'BAD_RESPONSE', false],
  [
    'no transport',
    () => new ProviderError('TRANSPORT_NOT_STARTED', 'x'),
    'TRANSPORT_NOT_STARTED',
    false,
  ],
  ['its own timeout', () => new ProviderError('TIMEOUT', 'slow'), 'TIMEOUT', false],
  ['a budget denial', () => denied('BUDGET_DENIED'), 'BUDGET_DENIED', false],
  ['disabled admission', () => denied('ADMISSION_DISABLED'), 'ADMISSION_DISABLED', false],
  ['unavailable admission', () => denied('ADMISSION_UNAVAILABLE'), 'ADMISSION_UNAVAILABLE', false],
  ['an unexpected model', () => suspect('UNEXPECTED_MODEL'), 'UNEXPECTED_MODEL', true],
  ['unverified billing', () => suspect('UNVERIFIED_BILLING'), 'UNVERIFIED_BILLING', true],
] as const;

describe.each(SWITCHING)('%s after a provider failure', (capability) => {
  it.each(FAILURES)('switches once to local on %s', async (_label, step, code, billed) => {
    const remote = scripted('remote', step(), validOutput);
    const outcome = await run(capability, routeOf(capability, remote));

    expect(outcome.status).toBe(LOCAL_VALID[capability]);
    expect(outcome.localCalls).toBe(1);
    expect(remote.requests).toHaveLength(1);
    expect(outcome.attempts).toMatchObject([
      {
        provider: 'remote',
        kind: 'initial',
        outcome: 'error',
        error: code,
        output: null,
        model: billed ? 'remote-model' : null,
        usage: billed ? USAGE : DENIALS.includes(code) ? ZERO : null,
      },
      { provider: 'local', kind: 'fallback', outcome: 'valid', error: null },
    ]);
  });

  it('keeps a failing local result rather than inventing one', async () => {
    const remote = scripted('remote', refusal());
    const outcome = await run(capability, () => [remote, scriptedLocal(new Error('down'))]);

    expect(outcome.status).toBe('AI_UNAVAILABLE');
    expectNoResult(capability, outcome);
  });

  it('calls a local-only route once, with no fictitious remote attempt', async () => {
    const outcome = await run(capability, (local) => [local]);

    expect(outcome.status).toBe(LOCAL_VALID[capability]);
    expect(outcome.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
      ['local', 'initial', 'valid'],
    ]);
  });
});

describe('relevance after a provider failure', () => {
  it.each(FAILURES)('answers deterministically on %s, with no local AI', async (_l, step, code) => {
    const remote = scripted('remote', step(), validOutput);
    const outcome = await run('relevance', () => [remote]);

    expect(outcome.status).toBe('AI_UNAVAILABLE');
    expect(outcome.result).toBe('deterministic');
    expect(outcome.localCalls).toBe(0);
    expect(outcome.attempts.map((a) => a.error)).toEqual([code]);
  });

  it('refuses a local relevance entry: the local provider has no ranker', async () => {
    const outcome = await run('relevance', (local) => [local]);
    expect(outcome).toMatchObject({ status: 'AI_UNAVAILABLE', result: 'deterministic' });
  });
});

describe.each(CAPABILITIES)('%s after invalid output', (capability) => {
  it('repairs once on the same remote, then ends INVALID_OUTPUT with no switch', async () => {
    const remote = scripted('remote', INVALID, INVALID, validOutput);
    const outcome = await run(capability, routeOf(capability, remote));

    expect(outcome.status).toBe('INVALID_OUTPUT');
    expectNoResult(capability, outcome);
    expect(outcome.localCalls).toBe(0);
    expect(outcome.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
      ['remote', 'initial', 'invalid'],
      ['remote', 'repair', 'invalid'],
    ]);
  });

  it.each(['MISSING_TOOL', 'TRUNCATED', 'INVALID_JSON'] as const)(
    'treats %s as invalid output: one repair, usage kept',
    async (code) => {
      const remote = scripted('remote', malformed(code), validOutput);
      const outcome = await run(capability, routeOf(capability, remote));

      expect(outcome.status).toBe(REMOTE_VALID[capability]);
      expect(outcome.localCalls).toBe(0);
      expect(outcome.attempts).toMatchObject([
        { kind: 'initial', outcome: 'invalid', error: null, issues: [code], usage: USAGE },
        { kind: 'repair', outcome: 'valid' },
      ]);
      expect(remote.requests[1]?.task.repair).toEqual({ output: null, issues: [code] });
    },
  );

  it.each(['BUDGET_DENIED', 'ADMISSION_DISABLED', 'ADMISSION_UNAVAILABLE'] as const)(
    'ends INVALID_OUTPUT when the repair is denied (%s), keeping the invalid output',
    async (code) => {
      const remote = scripted('remote', INVALID, denied(code));
      const outcome = await run(capability, routeOf(capability, remote));

      expect(outcome.status).toBe('INVALID_OUTPUT');
      expectNoResult(capability, outcome);
      expect(outcome.localCalls).toBe(0);
      expect(outcome.attempts).toMatchObject([
        { kind: 'initial', outcome: 'invalid', output: JSON.stringify(INVALID) },
        { kind: 'repair', outcome: 'error', error: code, model: null, usage: ZERO, output: null },
      ]);
    },
  );
});

describe.each(['dialogue', 'chronicle', 'relevance'] as const)('%s and a decline', (capability) => {
  it('treats a decline envelope as the wrong output kind and repairs it', async () => {
    const decline = { kind: 'decline', reason: 'not_game' };
    const remote = scripted('remote', decline, decline);
    const outcome = await run(capability, routeOf(capability, remote));

    expect(outcome.status).toBe('INVALID_OUTPUT');
    expect(outcome.localCalls).toBe(0);
    expect(outcome.attempts.map((a) => a.issues)).toEqual([
      ['WRONG_OUTPUT_KIND'],
      ['WRONG_OUTPUT_KIND'],
    ]);
  });
});

describe('intent declines', () => {
  it.each(['not_game', 'ambiguous', 'unsupported'] as const)(
    'ends a valid %s decline at once: INVALID_OUTPUT, NO_PROPOSAL, nothing committable',
    async (reason) => {
      const remote = scripted('remote', { kind: 'decline', reason }, validOutput);
      const outcome = await run('intent', (local) => [remote, local]);

      expect(outcome).toMatchObject({
        status: 'INVALID_OUTPUT',
        result: null,
        issues: ['NO_PROPOSAL'],
        localCalls: 0,
      });
      expect(remote.requests).toHaveLength(1);
      expect(outcome.attempts).toMatchObject([
        { kind: 'initial', outcome: 'invalid', error: null, issues: ['NO_PROPOSAL'] },
      ]);
      expect(outcome.trace).toMatchObject({
        status: 'INVALID_OUTPUT',
        proposal: null,
        declineReason: reason,
      } satisfies Partial<DmIntentTraceView>);
    },
  );

  it.each([
    ['an unknown reason', { kind: 'decline', reason: 'bored' }],
    ['a decline with a proposal', { kind: 'decline', reason: 'not_game', proposal: {} }],
    [
      'a proposal with a reason',
      {
        kind: 'proposal',
        proposal: { summary: 'x', commands: [{ type: 'AdvanceWorldTime', by: 60 }] },
        reason: 'ambiguous',
      },
    ],
    ['a bare proposal', { summary: 'x', commands: [{ type: 'AdvanceWorldTime', by: 60 }] }],
  ])('repairs a malformed envelope (%s) like any invalid output', async (_label, output) => {
    const remote = scripted('remote', output, output);
    const outcome = await run('intent', (local) => [remote, local]);

    expect(outcome.status).toBe('INVALID_OUTPUT');
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.localCalls).toBe(0);
    expect(outcome.trace).not.toHaveProperty('declineReason');
  });
});

describe('Chronicle without valid prose', () => {
  it('uses the template directly after invalid output, never a provider switch', async () => {
    const remote = scripted('remote', INVALID, INVALID);
    const outcome = await run('chronicle', (local) => [remote, local]);
    const trace = outcome.trace as ChronicleTraceView;

    expect(outcome).toMatchObject({ status: 'INVALID_OUTPUT', result: 'template', localCalls: 0 });
    expect(trace.paragraphs).toBeNull();
  });
});
