import { commandProposalSchema } from '@ltw/contracts';
import { SequentialIds, SteppingClock } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { interpretDmIntent } from './intent.ts';
import { createLocalProvider, isLocalProvider } from './local-provider.ts';
import { INTENT_OUTPUT, intentRequest } from './prompt.ts';
import { CapabilityRouter } from './router.ts';
import { scriptedLocal, steppingMs, testBrand } from './testing/providers.ts';
import { CAMPAIGN, DM, seedRavenford, type SeededWorld } from './testing/ravenford.ts';
import { InMemoryAiTraceStore } from './traces.ts';
import { validateIntent } from './validation.ts';

/**
 * The intent tool's envelope (docs/adr/0032-live-ai.md, B1): `{kind: "proposal", proposal}` or
 * `{kind: "decline", reason}` on the wire as one top-level object, exact combinations enforced
 * in validation, the canonical proposal schema unchanged; the local provider's identity.
 */
const PROPOSAL = {
  summary: 'An hour passes.',
  commands: [{ type: 'AdvanceWorldTime', by: 3_600 }],
};

let world: SeededWorld;
beforeAll(async () => {
  world = await seedRavenford();
});

describe('the intent wire schema', () => {
  it('is one top-level object with a kind discriminator, never a top-level oneOf', () => {
    const { schema } = INTENT_OUTPUT;
    expect(schema).toMatchObject({
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['proposal', 'decline'] },
        reason: { type: 'string', enum: ['not_game', 'ambiguous', 'unsupported'] },
      },
    });
    for (const key of ['oneOf', 'anyOf', 'allOf', '$ref', '$schema']) {
      expect(schema).not.toHaveProperty(key);
    }
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
  });

  it('carries the canonical proposal schema unchanged in its proposal branch', () => {
    const canonical = Object.fromEntries(
      Object.entries(z.toJSONSchema(commandProposalSchema)).filter(([key]) => key !== '$schema'),
    );
    expect(
      (INTENT_OUTPUT.schema as { properties: { proposal: unknown } }).properties.proposal,
    ).toEqual(canonical);
  });

  it('asks for a decline instead of an empty proposal, and never to invent a command', () => {
    const request = intentRequest(
      'text',
      { scope: 'PUBLIC', items: [], entities: [], worldTime: 0 },
      {
        output: {},
        issues: ['x'],
      },
    );
    expect(request.system).toContain('kind "decline"');
    expect(request.system).toContain('Never invent a command');
    expect(request.system).not.toContain('empty commands list');
    expect(request.prompt).toContain('Return a corrected answer.');
    expect(request.output).toBe(INTENT_OUTPUT);
  });
});

describe('validateIntent', () => {
  const directory = new Set<string>();

  it('accepts exactly a proposal or a decline', () => {
    expect(validateIntent({ kind: 'proposal', proposal: PROPOSAL }, directory)).toEqual({
      ok: true,
      value: PROPOSAL,
    });
    for (const reason of ['not_game', 'ambiguous', 'unsupported']) {
      expect(validateIntent({ kind: 'decline', reason }, directory)).toEqual({
        ok: false,
        issues: ['NO_PROPOSAL'],
        decline: reason,
      });
    }
  });

  it.each([
    ['a bare proposal', PROPOSAL],
    ['a proposal without one', { kind: 'proposal' }],
    ['a proposal with a reason', { kind: 'proposal', proposal: PROPOSAL, reason: 'ambiguous' }],
    ['a decline without a reason', { kind: 'decline' }],
    ['a decline with a proposal', { kind: 'decline', reason: 'not_game', proposal: PROPOSAL }],
    ['an unknown reason', { kind: 'decline', reason: 'bored' }],
    ['an unknown kind', { kind: 'other' }],
    ['an empty proposal', { kind: 'proposal', proposal: { summary: 'x', commands: [] } }],
  ])('rejects %s as invalid output, not a decline', (_label, output) => {
    const check = validateIntent(output, directory);
    expect(check.ok).toBe(false);
    expect(check).not.toHaveProperty('decline');
  });

  it('checks a proposal against the directory as before', () => {
    const check = validateIntent(
      {
        kind: 'proposal',
        proposal: {
          summary: 'x',
          commands: [{ type: 'ChangeEntityStatus', entityId: 'nobody', status: 'dead' }],
        },
      },
      directory,
    );
    expect(check).toEqual({
      ok: false,
      issues: ['proposal.commands.0.entityId: unknown entity "nobody"'],
    });
  });
});

describe('the local provider', () => {
  const ask = async (text: string, provider = createLocalProvider()) => {
    const traces = new InMemoryAiTraceStore();
    const clock = new SteppingClock();
    const outcome = await interpretDmIntent(
      {
        router: new CapabilityRouter({ reasoning: [provider] }),
        traces,
        ids: new SequentialIds(),
        clock: { now: () => clock.now(), nowMs: steppingMs() },
      },
      { campaignId: CAMPAIGN, state: world.state, actor: DM, text },
    );
    if (!outcome.ok) throw new Error(outcome.reason);
    return { response: outcome.response, trace: traces.all()[0] };
  };

  it.each(['Tell me a joke.', 'Расскажи мне анекдот.'])(
    'declines what it cannot read (%s) as unsupported, in one attempt',
    async (text) => {
      const { response, trace } = await ask(text);

      expect(response).toMatchObject({
        status: 'INVALID_OUTPUT',
        proposal: null,
        issues: ['NO_PROPOSAL'],
        committable: false,
      });
      expect(trace).toMatchObject({ status: 'INVALID_OUTPUT', declineReason: 'unsupported' });
      expect(trace?.attempts).toMatchObject([
        {
          provider: 'local',
          kind: 'initial',
          outcome: 'invalid',
          error: null,
          issues: ['NO_PROPOSAL'],
        },
      ]);
    },
  );

  it.each(['Advance time by 0 minutes.', 'Advance time by 99999999999999 days.'])(
    'ends invalid output it produced (%s) after one attempt, with nothing committable',
    async (text) => {
      const { response, trace } = await ask(text);

      expect(response).toMatchObject({
        status: 'INVALID_OUTPUT',
        proposal: null,
        committable: false,
      });
      expect(response.issues.length).toBeGreaterThan(0);
      expect(response.issues).not.toContain('NO_PROPOSAL');
      expect(trace?.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
        ['local', 'initial', 'invalid'],
      ]);
      expect(trace).not.toHaveProperty('declineReason');
    },
  );

  it('wraps what it can read as a proposal', async () => {
    const { response, trace } = await ask('Advance time by 2 hours.');

    expect(response).toMatchObject({ status: 'PROPOSED', proposal: { commands: [{ by: 7_200 }] } });
    expect(JSON.parse(trace?.attempts[0]?.output ?? 'null')).toMatchObject({ kind: 'proposal' });
    expect(trace).not.toHaveProperty('declineReason');
  });

  it('is recognised by identity only, and cannot be altered', () => {
    const local = createLocalProvider();
    expect(isLocalProvider(local)).toBe(true);
    expect(isLocalProvider({ ...local })).toBe(false);
    expect(
      isLocalProvider(
        testBrand('local', 'local', (request, attempt) => local.generate(request, attempt)),
      ),
    ).toBe(false);
    expect(isLocalProvider(scriptedLocal())).toBe(false);
    expect(Object.isFrozen(local)).toBe(true);
    expect(() => {
      (local as { generate: unknown }).generate = () => Promise.resolve();
    }).toThrow(TypeError);
  });
});
