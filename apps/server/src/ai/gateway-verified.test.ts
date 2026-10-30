import { readFileSync } from 'node:fs';

import type {
  DmIntentResponse,
  EntityContextResponse,
  GenerateChronicleResponse,
  NpcDialogueResponse,
} from '@ltw/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Secret, loadConfig, type AppConfig } from '../platform/config/config.ts';
import { fakeBudgetStore } from '../testing/fake-budget-store.ts';
import { fakeFetch, jsonResponse } from '../testing/fake-fetch.ts';
import { composedGateway } from '../testing/gateways.ts';
import { TOKENS, get, post, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';
import { VERIFIED_CATALOG } from './catalog.ts';
import type { AiGatewayOptions } from './gateway.ts';

/**
 * The production catalog at checkpoint C (docs/adr/0032-live-ai.md): with the verified Sonnet 5.5
 * entry present, a remote Sonnet route is usable only with its key, a selected stored approval, the
 * accounting store and, per request, an eligible session that admission accepts. Every other case
 * sends nothing and reads no key. Transport is an injected fake; the global `fetch` is the test
 * trap (`tests/setup/no-network.ts`).
 */
class CountingSecret extends Secret {
  reveals = 0;
  override reveal(): string {
    this.reveals += 1;
    return 'sk-never-a-real-key';
  }
}

const SONNET = 'anthropic:claude-sonnet-5-5';
// Every capability on Sonnet 5.5, to exercise each path; the runtime example routes relevance to
// no paid model (owner decisions 6; tested below).
const ROUTES = {
  reasoning: [SONNET, 'local'],
  'npc-dialogue': [SONNET, 'local'],
  narrative: [SONNET, 'local'],
  'fast-context': [SONNET],
};

function config(options: { key?: boolean; approvalId?: string | null } = {}) {
  const secret = new CountingSecret('k');
  const ai: AppConfig['ai'] = {
    ...loadConfig({}).ai,
    anthropic:
      options.key === false
        ? null
        : { apiKey: secret, model: 'claude-sonnet-5-5', timeoutMs: 30_000 },
    routes: ROUTES,
    approvalId: options.approvalId === undefined ? 'approval-1' : options.approvalId,
  };
  return { ai, secret };
}

const SONNET_REPLY = {
  id: 'msg_1',
  model: 'claude-sonnet-5-5',
  stop_reason: 'tool_use',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'propose_commands',
      input: {
        kind: 'proposal',
        proposal: {
          summary: 'An hour passes.',
          commands: [{ type: 'AdvanceWorldTime', by: 3600 }],
        },
      },
    },
  ],
  usage: {
    input_tokens: 900,
    output_tokens: 40,
    service_tier: 'standard',
    inference_geo: 'global',
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function serveAll(
  ai: AppConfig['ai'],
  options: Partial<AiGatewayOptions>,
  session: 'open' | 'closed',
) {
  const { gateway, journal } = composedGateway(ai, { catalog: VERIFIED_CATALOG, ...options });
  const engine = await seededEngine();
  const activeSession = async () => (await engine.load('ravenford'))?.state.activeSessionId ?? null;
  expect(await activeSession()).not.toBeNull();
  if (session === 'closed') {
    const result = await engine.execute({
      commandId: 'close.session',
      campaignId: 'ravenford',
      actor: { actorId: 'dm-ravenford', kind: 'user' },
      command: { type: 'EndSession', sessionId: (await activeSession()) ?? '' },
    });
    expect(result.status).not.toBe('rejected');
    expect(await activeSession()).toBeNull();
  }
  const app = await ravenfordApp(engine, gateway);
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

describe('the documented runtime routes (.env.example, owner decisions 6)', () => {
  it('route intents, NPC dialogue and Chronicle to Sonnet 5.5, and relevance to no paid model', () => {
    const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('# LTW_AI_ROUTES='));
    expect(example).toBeDefined();
    const loaded = loadConfig({
      ANTHROPIC_API_KEY: 'sk-never',
      LTW_AI_ROUTES: (example ?? '').replace('# LTW_AI_ROUTES=', ''),
    }).ai;
    expect(loaded.routes).not.toHaveProperty('fast-context');
    const { secret } = config();
    const { gateway } = composedGateway(
      {
        ...loaded,
        anthropic: { apiKey: secret, model: 'claude-sonnet-5-5', timeoutMs: 30_000 },
        approvalId: 'approval-1',
      },
      { catalog: VERIFIED_CATALOG, approvalStored: true, budget: fakeBudgetStore() },
    );
    // The startup route report: relevance has no provider and nothing refused (deterministic).
    expect(gateway.routes).toEqual([
      { capability: 'reasoning', providers: [SONNET, 'local'], refused: [] },
      { capability: 'npc-dialogue', providers: [SONNET, 'local'], refused: [] },
      { capability: 'narrative', providers: [SONNET, 'local'], refused: [] },
      { capability: 'fast-context', providers: [], refused: [] },
      { capability: 'campaign-preparation', providers: [], refused: [] },
    ]);
    expect(secret.reveals).toBe(0);
  });
});

describe('the verified Sonnet 5.5 route', () => {
  it.each([
    ['no approval is selected', { approvalId: null }, {}, 'NO_APPROVAL_SELECTED'],
    [
      'the selected approval is not stored',
      {},
      { budget: fakeBudgetStore() },
      'APPROVAL_NOT_STORED',
    ],
    ['there is no accounting store', {}, { approvalStored: true }, 'NO_ACCOUNTING_STORE'],
    [
      'there is no key',
      { key: false },
      { approvalStored: true, budget: fakeBudgetStore() },
      'NO_KEY',
    ],
  ] as const)(
    'is refused when %s: zero outbound requests, no key read',
    async (_label, keys, options, reason) => {
      const { ai, secret } = config(keys);
      const fake = fakeFetch(() => jsonResponse(SONNET_REPLY));
      const served = await serveAll(ai, { ...options, fetch: fake.fetchImpl }, 'open');
      expect(served.gateway.routes.map((route) => route.refused)).toEqual([
        ...Object.keys(ROUTES).map(() => [{ entry: SONNET, reason }]),
        [],
      ]);
      expect(served.intent.status).toBe('PROPOSED');
      expect(served.reply.reply?.status).toBe('REPLIED');
      expect(served.ranked.ranking).toMatchObject({ source: 'deterministic' });
      expect(served.chapter.rendering.status).toBe('RENDERED');
      if ('budget' in options) expect(options.budget.calls).toEqual([]);
      expect(fake.calls).toEqual([]);
      expect(secret.reveals).toBe(0);
    },
  );

  it('sends nothing without an eligible session, even when every other condition holds', async () => {
    const { ai, secret } = config();
    const budget = fakeBudgetStore();
    const fake = fakeFetch(() => jsonResponse(SONNET_REPLY));
    const served = await serveAll(
      ai,
      { approvalStored: true, budget, fetch: fake.fetchImpl },
      'closed',
    );
    // Routed, yet every request without a play session runs only locally (or deterministically).
    expect(served.gateway.routes.map((route) => route.providers)).toEqual([
      [SONNET, 'local'],
      [SONNET, 'local'],
      [SONNET, 'local'],
      [SONNET],
      [],
    ]);
    expect(served.intent.status).toBe('PROPOSED');
    const trace = await served.journal.get('ravenford', served.intent.traceId ?? '');
    expect(trace?.attempts.map((attempt) => attempt.provider)).toEqual(['local']);
    expect(served.ranked.ranking).toMatchObject({ source: 'deterministic' });
    expect(budget.calls).toEqual([]);
    expect(fake.calls).toEqual([]);
    expect(secret.reveals).toBe(0);
  });

  it('dispatches only after admission, through the injected transport, with an eligible session', async () => {
    const { ai, secret } = config();
    const budget = fakeBudgetStore();
    const fake = fakeFetch(() => jsonResponse(SONNET_REPLY));
    const served = await serveAll(
      { ...ai, routes: { reasoning: [SONNET, 'local'] } },
      { approvalStored: true, budget, fetch: fake.fetchImpl },
      'open',
    );
    expect(served.intent.status).toBe('PROPOSED');
    const trace = await served.journal.get('ravenford', served.intent.traceId ?? '');
    // 900 × 2 + 40 × 10 µ$ at the verified prices.
    expect(trace?.attempts).toMatchObject([
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        outcome: 'valid',
        billing: {
          status: 'known',
          pricingVersion: 'anthropic-claude-sonnet-5-5-2026-10-12',
          costMicros: '2200',
        },
      },
    ]);
    expect(budget.calls.map((call) => call.kind)).toEqual(['admit', 'response', 'settle']);
    expect(budget.calls[0]).toMatchObject({
      request: {
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        pricingVersion: 'anthropic-claude-sonnet-5-5-2026-10-12',
        // $2.50 + 8,192 × $0.00001: the DM intent's max_tokens.
        reserveMicros: 2_581_920n,
      },
    });
    expect(fake.calls).toHaveLength(1);
    expect(JSON.parse(fake.calls[0]?.body ?? '{}')).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 8_192,
      output_config: { effort: 'medium' },
    });
    expect(secret.reveals).toBe(1);
  });
});
