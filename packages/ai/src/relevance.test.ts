import type { ContextAction, EntityContextView, RelevanceTraceView } from '@ltw/contracts';
import { SequentialIds, SteppingClock, holderPerspective, type WorldState } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { ProviderError, type AiProvider, type ProviderRequest } from './providers.ts';
import {
  applyRanking,
  rankContextActions,
  validateRanking,
  type RelevanceDeps,
} from './relevance.ts';
import { rankerContext } from './relevance-prompt.ts';
import { CapabilityRouter } from './router.ts';
import { InMemoryAiTraceStore } from './traces.ts';
import { scripted, steppingMs } from './testing/providers.ts';
import {
  CAMPAIGN,
  FORBIDDEN_MARKERS,
  NPC_BOUNDARY,
  PLAYER,
  seedRavenford,
} from './testing/ravenford.ts';

/**
 * AI relevance (docs/adr/0021-ai-relevance.md, owner decisions): only the
 * legal actions are offered and re-rated, nothing else changes, and every
 * outage, invalid answer, or exceeded budget leaves the deterministic
 * context exactly as it was.
 */
const ELOWEN = 'elowen-starwhisper';

/** A small seeded PRNG (mulberry32) for the property check. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const VIEW: EntityContextView = {
  entity: { entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' },
  visibleState: { present: true, status: 'active' },
  actions: [
    {
      id: 'ask_about',
      topic: { entityId: 'guild-caravan', kind: 'item', name: 'Merchant Guild caravan' },
      legal: true,
      relevance: 'high',
    },
    { id: 'talk', legal: true, relevance: 'medium' },
    { id: 'trade', legal: false, reason: 'NOT_AVAILABLE', relevance: 'low' },
    { id: 'inspect', legal: true, relevance: 'low' },
    {
      id: 'healing_word',
      legal: true,
      relevance: 'low',
      cost: { kind: 'slot', slotLevel: 1 },
      hints: ['RANGE_NOT_TRACKED'],
    },
    { id: 'longbow_attack', legal: false, reason: 'NO_WEAPON', relevance: 'low' },
  ],
};

let state: WorldState;
beforeAll(async () => {
  state = (await seedRavenford({ dialogue: true })).state;
});

function deps(budgetMs: number, ...providers: AiProvider[]) {
  const clock = new SteppingClock();
  const traces = new InMemoryAiTraceStore();
  const value: RelevanceDeps = {
    router: new CapabilityRouter({ 'fast-context': providers }),
    traces,
    ids: new SequentialIds(),
    clock: { now: () => clock.now(), nowMs: steppingMs() },
    relevanceBudgetMs: budgetMs,
  };
  return { deps: value, traces };
}

const rank = (d: RelevanceDeps, view: EntityContextView = VIEW, world: WorldState = state) =>
  rankContextActions(d, {
    campaignId: CAMPAIGN,
    actor: PLAYER,
    state: world,
    perspective: holderPerspective(world, { kind: 'CHARACTER', characterId: ELOWEN }),
    actingCharacterId: ELOWEN,
    context: view,
  });

const VALID = {
  ranking: [
    { key: 'a4', relevance: 'high' },
    { key: 'a2', relevance: 'high' },
    { key: 'a1', relevance: 'medium' },
    { key: 'a3', relevance: 'low' },
  ],
};

describe('rankContextActions', () => {
  it('re-rates and reorders the legal actions only, changing nothing else', async () => {
    const { deps: d, traces } = deps(2_000, scripted('remote', VALID));
    const ranked = await rank(d);

    expect(ranked.ranking).toEqual({
      source: 'ai',
      status: 'RANKED',
      traceId: expect.any(String) as string,
    });
    expect(ranked.actions).toEqual([
      { ...VIEW.actions[4], relevance: 'high' },
      { ...VIEW.actions[1], relevance: 'high' },
      { ...VIEW.actions[0], relevance: 'medium' },
      { ...VIEW.actions[3], relevance: 'low' },
      VIEW.actions[2],
      VIEW.actions[5],
    ]);
    const [trace] = traces.all() as RelevanceTraceView[];
    expect(trace).toMatchObject({
      purpose: 'relevance',
      capability: 'fast-context',
      scope: `CHARACTER:${ELOWEN}`,
      status: 'RANKED',
      entityId: 'mira-vale',
      actions: [
        { key: 'a1', id: 'ask_about', topicId: 'guild-caravan', evidenceId: null },
        { key: 'a2', id: 'talk', topicId: null, evidenceId: null },
        { key: 'a3', id: 'inspect', topicId: null, evidenceId: null },
        { key: 'a4', id: 'healing_word', topicId: null, evidenceId: null },
      ],
      ranking: VALID.ranking,
      canonicalEvents: [],
    });
  });

  it('answers deterministically when no ranker is configured, an error, or invalid output', async () => {
    const invalid = { ranking: [{ key: 'a9', relevance: 'high' }] };
    for (const [providers, status] of [
      [[], 'AI_UNAVAILABLE'],
      [[scripted('remote', new ProviderError('UNAVAILABLE', 'down'))], 'AI_UNAVAILABLE'],
      [[scripted('remote', new Error('crashed'))], 'AI_UNAVAILABLE'],
      [[scripted('remote', invalid, invalid)], 'INVALID_OUTPUT'],
    ] as const) {
      const { deps: d, traces } = deps(2_000, ...providers);
      const ranked = await rank(d);
      expect(ranked.actions, status).toBe(VIEW.actions);
      expect(ranked.ranking).toMatchObject({ source: 'deterministic', status });
      expect(traces.all()[0]).toMatchObject({ status, ranking: null });
    }
  });

  it('leaves a ranker behind once the budget runs out, whether or not it stops', async () => {
    const silent: AiProvider = { id: 'silent', generate: () => new Promise(() => undefined) };
    const polite: AiProvider = {
      id: 'polite',
      generate: (request: ProviderRequest) =>
        new Promise((_, reject) => {
          request.signal?.addEventListener('abort', () => {
            reject(new ProviderError('TIMEOUT', 'stopped'));
          });
        }),
    };
    for (const provider of [silent, polite]) {
      const { deps: d } = deps(50, provider);
      const started = performance.now();
      const ranked = await rank(d);
      expect(performance.now() - started).toBeLessThan(1_000);
      expect(ranked.actions).toBe(VIEW.actions);
      expect(ranked.ranking).toMatchObject({ source: 'deterministic', status: 'TIMEOUT' });
    }
  });

  it('asks nobody when fewer than two actions are legal', async () => {
    const provider = scripted('remote', VALID);
    const { deps: d, traces } = deps(2_000, provider);
    const view = {
      ...VIEW,
      actions: VIEW.actions.filter(
        (a) => a.id !== 'talk' && a.id !== 'inspect' && a.id !== 'healing_word',
      ),
    };
    const ranked = await rank(d, view);
    expect(ranked).toEqual({
      actions: view.actions,
      ranking: { source: 'deterministic', status: 'NOTHING_TO_RANK', traceId: null },
    });
    expect(provider.requests).toHaveLength(0);
    expect(traces.all()).toHaveLength(0);
  });
});

describe('what the ranker is sent', () => {
  it('names and sentences the character may know, never an ID, and only legal actions', async () => {
    const provider = scripted('remote', VALID);
    const { deps: d } = deps(2_000, provider);
    await rank(d);
    const request = provider.requests[0];
    const sent = JSON.stringify({ ...request, signal: undefined });

    expect(sent).toContain('Ask them about Merchant Guild caravan');
    expect(sent).toContain('a level 1 slot');
    expect(sent).not.toContain('Trade with them');
    expect(sent).not.toContain('longbow');
    const built = rankerContext(
      state,
      holderPerspective(state, { kind: 'CHARACTER', characterId: ELOWEN }),
      ELOWEN,
      VIEW,
    );
    for (const sourceId of built.sourceIds) expect(sent, sourceId).not.toContain(sourceId);
    // What Elowen's own perspective may see (her party's and her own records and memories) is allowed.
    const hers = new Set([
      'NBXPARTY',
      'NBXELOWEN',
      'Goblins attacked',
      'Who attacked',
      'Mira told us',
      'sigils',
      'glancing nervously',
      'search the Old Trade Road',
      'bought supplies',
    ]);
    const never = [
      ...(FORBIDDEN_MARKERS[`CHARACTER:${ELOWEN}`] ?? []),
      ...NPC_BOUNDARY.neverSaid['*'].filter((marker) => !hers.has(marker)),
      'NBXMIRAWILLING',
      'NBXORINWILLING',
      'NBXMIRAMEMORY',
      'NBXORINMEMORY',
    ];
    for (const marker of never) expect(sent, marker).not.toContain(marker);
  });

  it('is the same whatever the character cannot know', async () => {
    const world = await seedRavenford({ dialogue: true });
    const changed = await seedRavenford({ dialogue: true });
    let counter = 0;
    for (const command of [
      {
        type: 'AddKnowledge',
        knowledgeId: 'hidden-caravan-truth',
        scope: { kind: 'WORLD_TRUTH' },
        knowledgeType: 'FACT',
        statement: 'The caravan never left the guild yard.',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      {
        type: 'AddKnowledge',
        knowledgeId: 'hidden-mira-plan',
        scope: { kind: 'NPC', npcId: 'mira-vale' },
        knowledgeType: 'FACT',
        statement: 'Mira plans to leave town tonight.',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      { type: 'UpdateEntityProfile', entityId: 'mira-vale', description: 'Secretly an informant.' },
    ]) {
      counter += 1;
      const result = await changed.engine.execute({
        commandId: `hidden.${String(counter)}`,
        campaignId: CAMPAIGN,
        actor: { actorId: 'dm-ravenford', kind: 'user' },
        command,
      });
      expect(result.status).toBe('accepted');
    }
    const requests = [];
    for (const seeded of [world, changed]) {
      const snapshot = await seeded.engine.load(CAMPAIGN);
      if (!snapshot) throw new Error('missing campaign');
      const provider = scripted('remote', VALID);
      await rank(deps(2_000, provider).deps, VIEW, snapshot.state);
      requests.push(provider.requests[0]);
    }
    expect(requests[1]?.prompt).toBe(requests[0]?.prompt);
    expect(requests[1]?.task).toEqual(requests[0]?.task);
  });
});

describe('applying a ranking', () => {
  it('keeps every action and every field but relevance, for any valid ranking', () => {
    const keys = [0, 1, 3, 4].map((index, position) => ({
      key: `a${String(position + 1)}`,
      index,
    }));
    const levels = ['high', 'medium', 'low'] as const;
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed);
      const order = keys
        .map((k) => ({ k, sort: rng() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ k }) => ({ key: k.key, relevance: levels[Math.floor(rng() * 3)] ?? 'low' }));
      const check = validateRanking(
        { ranking: order },
        keys.map((k) => k.key),
      );
      expect(check.ok).toBe(true);
      const applied = applyRanking(VIEW.actions, keys, order);
      const strip = (actions: readonly ContextAction[]) =>
        actions.map((action) => JSON.stringify({ ...action, relevance: undefined })).sort();
      expect(strip(applied)).toEqual(strip(VIEW.actions));
      for (const action of applied.filter((a) => !a.legal)) {
        expect(VIEW.actions).toContainEqual(action);
      }
      const ranks = applied.map((a) => ({ high: 0, medium: 1, low: 2 })[a.relevance]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('refuses anything but each offered key exactly once', () => {
    const keys = ['a1', 'a2'];
    const issues = (output: unknown) => {
      const check = validateRanking(output, keys);
      return check.ok ? [] : check.issues;
    };
    expect(
      issues({
        ranking: [
          { key: 'a1', relevance: 'high' },
          { key: 'a2', relevance: 'low' },
        ],
      }),
    ).toEqual([]);
    expect(issues({ ranking: [{ key: 'a1', relevance: 'high' }] })).toEqual([
      'ranking: "a2" is missing',
    ]);
    expect(
      issues({
        ranking: [
          { key: 'a1', relevance: 'high' },
          { key: 'a1', relevance: 'low' },
        ],
      }),
    ).toEqual(['ranking.1.key: "a1" appears twice', 'ranking: "a2" is missing']);
    expect(
      issues({
        ranking: [
          { key: 'a3', relevance: 'high' },
          { key: 'a1', relevance: 'low' },
          { key: 'a2', relevance: 'low' },
        ],
      }),
    ).toEqual(['ranking.0.key: "a3" was not offered']);
    expect(issues({ ranking: [{ key: 'a1', relevance: 'urgent' }] }).length).toBeGreaterThan(0);
    expect(
      issues({ ranking: [{ key: 'a1', relevance: 'high', legal: false }] }).length,
    ).toBeGreaterThan(0);
    expect(issues('rank them all high').length).toBeGreaterThan(0);
  });
});
