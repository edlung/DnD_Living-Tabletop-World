import { createLocalProvider, outputResponse } from '@ltw/ai';
import type {
  AiCapability,
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Secret, loadConfig, type AppConfig } from '../platform/config/config.ts';
import { FIXTURE_CATALOG } from '../testing/catalog-fixtures.ts';
import { fakeBudgetStore } from '../testing/fake-budget-store.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { composedGateway } from '../testing/gateways.ts';
import { ANTHROPIC } from '../testing/raw-adapter-fixtures.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  recording,
  seededEngine,
  testProvider,
} from '../testing/ravenford-app.ts';
import { AccountingTasks, type AccountingIssue } from './accounting-tasks.ts';
import { CompositionError, composeRouter } from './composition.ts';
import type { AiGatewayOptions } from './gateway.ts';
import { LOCAL_ONLY } from './journal.ts';

/**
 * Gateway composition at checkpoint B2 (docs/adr/0032-live-ai.md): a configured remote entry is
 * routed only as an admitted wrapper, and only with a selected stored approval, an accounting store
 * and a verified catalog entry. Otherwise it is refused before any adapter is built or key read,
 * and the route is local only. Admission comes before any key or transport. Fixture catalog only.
 */
class CountingSecret extends Secret {
  reveals = 0;
  override reveal(): string {
    this.reveals += 1;
    return 'sk-never-a-real-key';
  }
}

const SONNET = 'anthropic:claude-sonnet-5-5';
// Sonnet 5.5 on every capability, to exercise each composition path. At runtime relevance has no
// paid route (owner decisions 6, `.env.example`); an explicit remote ranker stays allowed and has no
// local entry.
const ROUTES = {
  reasoning: [SONNET, 'local'],
  'npc-dialogue': [SONNET, 'local'],
  narrative: [SONNET, 'local'],
  'fast-context': [SONNET],
};

function keyed(approvalId: string | null = 'approval-1', remote = SONNET) {
  const secret = new CountingSecret('k');
  const ai: AppConfig['ai'] = {
    ...loadConfig({}).ai,
    anthropic: { apiKey: secret, model: 'claude-sonnet-5-5', timeoutMs: 30_000 },
    deepseek: { apiKey: secret, model: 'deepseek-flash', timeoutMs: 30_000 },
    routes:
      remote === SONNET
        ? ROUTES
        : {
            reasoning: [remote, 'local'],
            'npc-dialogue': [remote, 'local'],
            narrative: [remote, 'local'],
            'fast-context': [remote],
          },
    approvalId,
  };
  return { ai, secret };
}

const routeOf = (options: Parameters<typeof composedGateway>, capability: AiCapability) =>
  composedGateway(...options)
    .gateway.router.providersFor(capability)
    .map((provider) => provider.id);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every capability over HTTP: an intent, an NPC reply, a ranking and a Chronicle chapter. */
async function serveAll(options: Partial<AiGatewayOptions>, ai: AppConfig['ai']) {
  const { gateway, journal } = composedGateway(ai, options);
  const app = await ravenfordApp(await seededEngine(), gateway);
  try {
    const intent = await post(
      app,
      '/campaigns/ravenford/ai/intents',
      { text: 'Advance time by 1 hour.' },
      TOKENS.dm,
    );
    const reply = await post(
      app,
      '/campaigns/ravenford/npcs/mira-vale/dialogue',
      { characterId: 'elowen-starwhisper', intent: { kind: 'talk' }, line: 'Hello.' },
      TOKENS.player,
    );
    const ranked = await get(
      app,
      '/campaigns/ravenford/entities/mira-vale/context?perspective=PLAYER&ranking=ai',
      TOKENS.player,
    );
    const chapter = await post(
      app,
      '/campaigns/ravenford/chronicle',
      { title: 'Chapter I', perspective: 'PARTY', from: 0 },
      TOKENS.dm,
    );
    await gateway.accounting.idle();
    return {
      gateway,
      journal,
      intent: intent.json<DmIntentResponse>(),
      reply: reply.json<NpcDialogueResponse>(),
      ranked: ranked.json<EntityContextResponse>(),
      chapter: chapter.json<GenerateChronicleResponse>(),
    };
  } finally {
    await app.close();
  }
}

describe('createAiGateway at checkpoint B2', () => {
  it('routes locally without keys, and relevance nowhere (ADR 0021), reporting every capability', () => {
    const none = loadConfig({}).ai;
    expect(routeOf([none], 'reasoning')).toEqual(['local']);
    expect(routeOf([none], 'npc-dialogue')).toEqual(['local']);
    expect(routeOf([none], 'narrative')).toEqual(['local']);
    expect(routeOf([none], 'fast-context')).toEqual([]);
    expect(composedGateway(none).gateway.routes).toEqual([
      { capability: 'reasoning', providers: ['local'], refused: [] },
      { capability: 'npc-dialogue', providers: ['local'], refused: [] },
      { capability: 'narrative', providers: ['local'], refused: [] },
      { capability: 'fast-context', providers: [], refused: [] },
      { capability: 'campaign-preparation', providers: [], refused: [] },
    ]);
  });

  const REFUSALS = [
    ['no approval is selected', null, {}, 'NO_APPROVAL_SELECTED'],
    [
      'the approval is not stored',
      'approval-1',
      { catalog: FIXTURE_CATALOG },
      'APPROVAL_NOT_STORED',
    ],
    [
      'there is no accounting store',
      'approval-1',
      { catalog: FIXTURE_CATALOG, approvalStored: true },
      'NO_ACCOUNTING_STORE',
    ],
    // The production catalog verifies Sonnet 5.5 only (checkpoint C): any other model is refused.
    [
      'the model has no verified catalog entry (Opus 5.5)',
      'approval-1',
      { approvalStored: true, budget: fakeBudgetStore() },
      'UNVERIFIED_MODEL',
      'anthropic:claude-opus-5-5',
    ],
    [
      'the model has no verified catalog entry (DeepSeek)',
      'approval-1',
      { approvalStored: true, budget: fakeBudgetStore() },
      'UNVERIFIED_MODEL',
      'deepseek:deepseek-flash',
    ],
  ] as const;

  it.each(REFUSALS)(
    'refuses every remote entry when %s: zero outbound, no key read',
    async (_label, approvalId, options, reason, entry: string = SONNET) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { ai, secret } = keyed(approvalId, entry);
      const served = await serveAll(options, ai);
      expect(served.gateway.routes.map((route) => route.refused)).toEqual([
        ...['reasoning', 'npc-dialogue', 'narrative', 'fast-context'].map(() => [
          { entry, reason },
        ]),
        [],
      ]);
      expect(served.intent.status).toBe('PROPOSED');
      expect(served.reply.reply?.status).toBe('REPLIED');
      expect(served.ranked.ranking).toMatchObject({
        source: 'deterministic',
        status: 'AI_UNAVAILABLE',
      });
      expect(served.chapter.rendering.status).toBe('RENDERED');
      // A refused route is local only: no fictitious denied remote attempt.
      const trace = await served.journal.get('ravenford', served.intent.traceId ?? '');
      expect(trace?.attempts.map((a) => a.provider)).toEqual(['local']);
      expect([...served.journal.identities.values()].every((i) => i === LOCAL_ONLY)).toBe(true);
      if ('budget' in options) expect(options.budget.calls).toEqual([]);
      expect(secret.reveals).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('admits before any key or transport: a denied admission switches to local and sends nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { ai, secret } = keyed();
    const budget = fakeBudgetStore({
      decide: () => ({ status: 'denied', code: 'ADMISSION_DISABLED', detail: 'NOT_ELIGIBLE' }),
    });
    const served = await serveAll({ catalog: FIXTURE_CATALOG, approvalStored: true, budget }, ai);
    expect(served.gateway.routes.map((route) => route.providers)).toEqual([
      [SONNET, 'local'],
      [SONNET, 'local'],
      [SONNET, 'local'],
      [SONNET],
      [],
    ]);
    expect(served.intent.status).toBe('PROPOSED');
    const trace = await served.journal.get('ravenford', served.intent.traceId ?? '');
    expect(trace?.attempts).toMatchObject([
      {
        provider: 'anthropic',
        outcome: 'error',
        error: 'ADMISSION_DISABLED',
        billing: { status: 'not_dispatched' },
      },
      { provider: 'local', kind: 'fallback', outcome: 'valid', billing: { status: 'local' } },
    ]);
    expect(served.ranked.ranking).toMatchObject({ status: 'AI_UNAVAILABLE' });
    expect(budget.calls.map((call) => call.kind)).toEqual(['admit', 'admit', 'admit', 'admit']);
    expect(budget.calls[0]).toMatchObject({
      request: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    });
    expect(secret.reveals).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    // The request start carried the approval and the configured alias (journal identity).
    expect(served.journal.identities.get(served.intent.traceId ?? '')).toEqual({
      approvalId: 'approval-1',
      configuredModel: 'claude-sonnet-5-5',
    });
  });

  it('dispatches an admitted attempt through the injected transport only, and settles it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const issues: AccountingIssue[] = [];
    const { ai, secret } = keyed();
    const budget = fakeBudgetStore();
    const fake = fakeFetch(() => jsonResponse(ANTHROPIC.reply({ model: 'claude-sonnet-5-5' })));
    const { gateway, journal } = composedGateway(
      { ...ai, routes: { reasoning: [SONNET, 'local'] } },
      {
        catalog: FIXTURE_CATALOG,
        approvalStored: true,
        budget,
        fetch: fake.fetchImpl,
        tasks: new AccountingTasks((issue) => issues.push(issue)),
      },
    );
    const app = await ravenfordApp(await seededEngine(), gateway);
    try {
      const intent = (
        await post(
          app,
          '/campaigns/ravenford/ai/intents',
          { text: 'Advance time by 1 hour.' },
          TOKENS.dm,
        )
      ).json<DmIntentResponse>();
      await gateway.accounting.idle();
      expect(intent.status).toBe('PROPOSED');
      const trace = await journal.get('ravenford', intent.traceId ?? '');
      expect(trace?.attempts).toMatchObject([
        {
          provider: 'anthropic',
          outcome: 'valid',
          billing: { status: 'known', costMicros: '3396' },
        },
      ]);
      expect(budget.calls.map((call) => call.kind)).toEqual(['admit', 'response', 'settle']);
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.body).not.toContain(intent.traceId ?? '');
      expect(secret.reveals).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(issues).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('admits only the genuine local provider and registered admitted wrappers', () => {
    const local = createLocalProvider();
    const valid = () => Promise.resolve(outputResponse({}, 'm'));
    expect(composeRouter({ reasoning: [local] }).providersFor('reasoning')).toEqual([local]);
    for (const forged of [
      testProvider('local', 'local', valid),
      { ...local },
      recording(local),
      testProvider('anthropic', 'remote', valid),
    ]) {
      expect(() => composeRouter({ reasoning: [forged] })).toThrow(CompositionError);
    }
    expect(() => composeRouter({ 'fast-context': [local] })).toThrow(/no local provider/);
    expect(() => composeRouter({ reasoning: [local, local] })).toThrow();
  });

  it.each(['Advance time by 0 minutes.', 'Advance time by 99999999999999 days.'])(
    'answers an invalid local intent (%s) after one local attempt, over HTTP',
    async (text) => {
      const { gateway, journal } = composedGateway(keyed().ai);
      const app = await ravenfordApp(await seededEngine(), gateway);
      try {
        const response = await post(app, '/campaigns/ravenford/ai/intents', { text }, TOKENS.dm);
        expect(response.json<DmIntentResponse>()).toMatchObject({
          status: 'INVALID_OUTPUT',
          proposal: null,
          committable: false,
        });
        const trace = await journal.get(
          'ravenford',
          response.json<DmIntentResponse>().traceId ?? '',
        );
        expect(trace?.attempts.map((a) => [a.provider, a.kind, a.outcome])).toEqual([
          ['local', 'initial', 'invalid'],
        ]);
      } finally {
        await app.close();
      }
    },
  );

  it('issues UUID trace IDs, ISO timestamps and the configured deadlines', () => {
    const { gateway } = composedGateway(loadConfig({}).ai);
    expect(gateway.ids.next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const now = gateway.clock.now();
    expect(new Date(now).toISOString()).toBe(now);
    expect(gateway.relevanceBudgetMs).toBe(2_000);
    expect(gateway.requestTimeoutMs).toBe(60_000);
  });
});
