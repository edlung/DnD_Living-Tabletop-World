import { SequentialIds, SteppingClock } from '@ltw/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { interpretDmIntent, type IntentDeps } from './intent.ts';
import { createLocalProvider } from './local-provider.ts';
import { ProviderError, type AiProvider } from './providers.ts';
import { CapabilityRouter } from './router.ts';
import { InMemoryAiTraceStore } from './traces.ts';
import { scripted, steppingMs } from './testing/providers.ts';
import {
  ASHEN_CIRCLE_ID,
  CAMPAIGN,
  DM,
  FORBIDDEN_MARKERS,
  OUTSIDER,
  PLAYER,
  seedRavenford,
  type SeededWorld,
} from './testing/ravenford.ts';

/**
 * Stage 100's use case end to end (ADR 0017): the DM's words become a
 * proposal, every attempt is traced, the world does not change, and nothing
 * is committable.
 */
const TOMAS = 'Add a fisherman near the North Gate who saw the guild caravan leave before dawn.';
const VALID = { summary: 'An hour passes.', commands: [{ type: 'AdvanceWorldTime', by: 3_600 }] };

let world: SeededWorld;
let traces: InMemoryAiTraceStore;
beforeEach(async () => {
  world = await seedRavenford();
  traces = new InMemoryAiTraceStore();
});

function deps(...providers: AiProvider[]): IntentDeps {
  const clock = new SteppingClock();
  return {
    router: new CapabilityRouter({ reasoning: providers }),
    traces,
    ids: new SequentialIds(),
    clock: { now: () => clock.now(), nowMs: steppingMs() },
  };
}

const ask = (d: IntentDeps, text = TOMAS, actor = DM) =>
  interpretDmIntent(d, { campaignId: CAMPAIGN, state: world.state, actor, text });

describe('interpretDmIntent', () => {
  it('proposes, traces, and changes nothing', async () => {
    const before = await world.version();
    const outcome = await ask(deps(createLocalProvider()));
    if (!outcome.ok) throw new Error(outcome.reason);
    const { response } = outcome;

    expect(response).toMatchObject({ status: 'PROPOSED', issues: [], committable: false });
    expect(response.proposal?.commands.map((c) => c.type)).toEqual([
      'CreateEntity',
      'AddKnowledge',
    ]);
    expect(await world.version()).toBe(before);

    const trace = await traces.get(CAMPAIGN, response.traceId);
    expect(trace).toMatchObject({
      campaignId: CAMPAIGN,
      actorId: DM.actorId,
      purpose: 'dm-intent',
      capability: 'reasoning',
      scope: 'PUBLIC',
      input: TOMAS,
      status: 'PROPOSED',
      proposal: response.proposal,
      canonicalEvents: [],
    });
    expect(trace?.sourceIds).toContain('world#clock');
    expect(trace?.sourceIds).toContain('north-gate');
    expect(trace?.sourceIds).not.toContain(ASHEN_CIRCLE_ID);
    expect(trace?.attempts).toMatchObject([
      { provider: 'local', model: 'local-interpreter-1', kind: 'initial', outcome: 'valid' },
    ]);
  });

  it.each([
    ['a player', PLAYER, 'FORBIDDEN'],
    ['a non-member', OUTSIDER, 'NOT_FOUND'],
  ] as const)('refuses %s before any provider is called', async (_label, actor, reason) => {
    const spy = scripted('spy', VALID);
    const outcome = await ask(deps(spy), TOMAS, actor);

    expect(outcome).toEqual({ ok: false, reason });
    expect(spy.requests).toHaveLength(0);
    expect(traces.all()).toEqual([]);
  });

  it('refuses a campaign that does not exist', async () => {
    const spy = scripted('spy', VALID);
    const outcome = await interpretDmIntent(deps(spy), {
      campaignId: 'nowhere',
      state: null,
      actor: DM,
      text: TOMAS,
    });

    expect(outcome).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(spy.requests).toHaveLength(0);
  });

  it('sends providers only the public directory, identical on fallback and repair', async () => {
    const failing = scripted('remote', new ProviderError('TIMEOUT', 'slow'));
    const backup = scripted('backup', { summary: 'bad', commands: [] }, VALID);
    const outcome = await ask(deps(failing, backup));
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.response.status).toBe('PROPOSED');
    const requests = [...failing.requests, ...backup.requests];
    expect(requests).toHaveLength(3);
    // Owner decision (ADR 0017 §3): entities and world time only, no knowledge records.
    for (const request of requests) {
      expect(new Set(request.task.context.items.map((item) => item.kind))).toEqual(
        new Set(['world-time', 'entity']),
      );
    }
    const directories = requests.map((r) => r.prompt.split('</directory>')[0]);
    expect(new Set(directories).size).toBe(1);
    expect(requests.every((r) => r.task.context === requests[0]?.task.context)).toBe(true);
    for (const request of requests) {
      const sent = JSON.stringify({
        ...request,
        task: { ...request.task, text: '' },
        prompt: request.prompt.replace(TOMAS, ''),
      });
      for (const marker of FORBIDDEN_MARKERS['PUBLIC'] ?? []) expect(sent).not.toContain(marker);
    }
    expect(backup.requests[1]?.prompt).toContain('<previous_output_was_invalid>');

    const trace = await traces.get(CAMPAIGN, outcome.response.traceId);
    expect(trace?.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
      ['remote', 'initial', 'error'],
      ['backup', 'fallback', 'invalid'],
      ['backup', 'repair', 'valid'],
    ]);
  });

  it('reports invalid output without a proposal, and traces it', async () => {
    const secret = {
      summary: 'Reveal the cult.',
      commands: [{ type: 'ChangeEntityStatus', entityId: ASHEN_CIRCLE_ID, status: 'destroyed' }],
    };
    const before = await world.version();
    const outcome = await ask(
      deps(scripted('remote', secret, secret)),
      'Destroy the Ashen Circle.',
    );
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.response).toMatchObject({
      status: 'INVALID_OUTPUT',
      proposal: null,
      committable: false,
    });
    expect(outcome.response.issues.join('\n')).toContain(`unknown entity "${ASHEN_CIRCLE_ID}"`);
    expect(await world.version()).toBe(before);
    const trace = await traces.get(CAMPAIGN, outcome.response.traceId);
    expect(trace).toMatchObject({ status: 'INVALID_OUTPUT', proposal: null, canonicalEvents: [] });
  });

  it('reports AI_UNAVAILABLE when every provider fails, and traces it', async () => {
    const outcome = await ask(
      deps(scripted('a', new Error('down')), scripted('b', new ProviderError('TIMEOUT', 'slow'))),
    );
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(outcome.response).toEqual({
      traceId: outcome.response.traceId,
      status: 'AI_UNAVAILABLE',
      proposal: null,
      issues: [],
      committable: false,
    });
    expect((await traces.get(CAMPAIGN, outcome.response.traceId))?.attempts).toHaveLength(2);
  });

  it('keeps traces per campaign', async () => {
    const outcome = await ask(deps(createLocalProvider()));
    if (!outcome.ok) throw new Error(outcome.reason);

    expect(await traces.get('another-campaign', outcome.response.traceId)).toBeNull();
  });
});
