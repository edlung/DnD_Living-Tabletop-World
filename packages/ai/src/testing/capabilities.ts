import type { AiAttemptView, AiTraceView, EntityContextView } from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  checkTalk,
  chronicleEntries,
  holderPerspective,
  npcDialogueContext,
  type WorldState,
} from '@ltw/domain';

import { renderChronicle } from '../chronicle.ts';
import { replyAsNpc } from '../dialogue.ts';
import { interpretDmIntent } from '../intent.ts';
import { createLocalProvider } from '../local-provider.ts';
import type { ProviderRequest, RoutedProvider } from '../providers.ts';
import { rankContextActions } from '../relevance.ts';
import { CapabilityRouter } from '../router.ts';
import { InMemoryAiTraceStore, type AiTraceStore } from '../traces.ts';
import { steppingMs, testBrand } from './providers.ts';
import { CAMPAIGN, DM, PLAYER, seedRavenford } from './ravenford.ts';

/**
 * Test support: each of the four AI use cases run over a given route, reduced to what the
 * outcome table of docs/adr/0032-live-ai.md (B1) pins: the public result, the trace status and
 * attempts, and how often the local provider was called.
 */
export type Capability = 'intent' | 'dialogue' | 'chronicle' | 'relevance';
export const CAPABILITIES: readonly Capability[] = ['intent', 'dialogue', 'chronicle', 'relevance'];

export interface CapabilityRun {
  /** The public status: the intent/reply status, the Chronicle rendering status, the ranking status. */
  readonly status: string;
  /** Proposal, reply text, Chronicle provider (`template` for template paragraphs), ranking source. */
  readonly result: unknown;
  readonly issues: readonly string[];
  readonly trace: AiTraceView;
  readonly attempts: readonly AiAttemptView[];
  readonly localCalls: number;
}

/** A scripted step answering validly for whichever capability asks. */
export function validOutput(request: ProviderRequest): unknown {
  switch (request.task.kind) {
    case 'dm-intent':
      return {
        kind: 'proposal',
        proposal: {
          summary: 'An hour passes.',
          commands: [{ type: 'AdvanceWorldTime', by: 3_600 }],
        },
      };
    case 'npc-dialogue':
      return { reply: 'Mira nods.' };
    case 'chronicle':
      return { paragraphs: request.task.prompt.template };
    case 'relevance':
      return {
        ranking: [
          { key: 'a1', relevance: 'high' },
          { key: 'a2', relevance: 'low' },
        ],
      };
  }
}

const VIEW: EntityContextView = {
  entity: { entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' },
  visibleState: { present: true, status: 'active' },
  actions: [
    { id: 'talk', legal: true, relevance: 'medium' },
    { id: 'inspect', legal: true, relevance: 'low' },
  ],
};

/** What a use case answered, before any trace is looked up. */
export interface CapabilityAnswer {
  readonly status: string;
  readonly result: unknown;
  readonly issues: readonly string[];
  /** The public trace ID (null for a no-start response). */
  readonly traceId: string | null;
  /** The answer's full public value: the intent response, reply, rendering or ranked context. */
  readonly value: unknown;
}

export interface RunOptions {
  /** The journal; default: a fresh in-memory store. */
  readonly traces?: AiTraceStore;
  /** The whole-request deadline (also relevance's budget); default 60 s (relevance 2 s). */
  readonly timeoutMs?: number;
  /** The campaign's active play session; default: the seeded one. */
  readonly session?: string | null;
}

export async function capabilityHarness() {
  const world = await seedRavenford({ dialogue: true });
  const seeded = world.state;
  const clock = new SteppingClock();

  /** Runs one use case over `providers` and answers what it returned. */
  async function answer(
    capability: Capability,
    providers: readonly RoutedProvider[],
    traces: AiTraceStore,
    options: RunOptions,
  ): Promise<CapabilityAnswer> {
    const state: WorldState =
      options.session === undefined ? seeded : { ...seeded, activeSessionId: options.session };
    const deps = {
      router: new CapabilityRouter({
        reasoning: providers,
        'npc-dialogue': providers,
        narrative: providers,
        'fast-context': providers,
      }),
      traces,
      ids: new SequentialIds(0xe1),
      clock: { now: () => clock.now(), nowMs: steppingMs() },
      requestTimeoutMs: options.timeoutMs ?? 60_000,
    };
    switch (capability) {
      case 'intent': {
        const outcome = await interpretDmIntent(deps, {
          campaignId: CAMPAIGN,
          state,
          actor: DM,
          text: 'Advance time by 1 hour.',
        });
        if (!outcome.ok) throw new Error(outcome.reason);
        const { response } = outcome;
        return {
          status: response.status,
          result: response.proposal,
          issues: response.issues,
          traceId: response.traceId,
          value: response,
        };
      }
      case 'dialogue': {
        const talk = checkTalk(state, PLAYER, 'elowen-starwhisper', 'mira-vale');
        if (!talk.ok) throw new Error(talk.code);
        const context = npcDialogueContext(state, {
          speaker: talk.speaker,
          npcId: 'mira-vale',
          topicId: null,
          justShared: [],
        });
        if (!context) throw new Error('no context');
        const reply = await replyAsNpc(deps, {
          campaignId: CAMPAIGN,
          accountingSessionId: state.activeSessionId,
          actor: PLAYER,
          context,
          intent: { kind: 'talk' },
          accepted: true,
          commandId: null,
          line: null,
        });
        return {
          status: reply.status,
          result: reply.text,
          issues: [],
          traceId: reply.traceId,
          value: reply,
        };
      }
      case 'chronicle': {
        const party = holderPerspective(state, { kind: 'PARTY' });
        const { entries } = chronicleEntries(state, [], party, 0, state.clock);
        const rendered = await renderChronicle(deps, {
          campaignId: CAMPAIGN,
          actor: DM,
          state,
          perspective: 'PARTY',
          title: 'Chapter I',
          entries,
        });
        return {
          status: rendered.status,
          result: rendered.prose.provider,
          issues: [],
          traceId: rendered.traceId,
          value: rendered,
        };
      }
      case 'relevance': {
        const ranked = await rankContextActions(
          { ...deps, relevanceBudgetMs: options.timeoutMs ?? 2_000 },
          {
            campaignId: CAMPAIGN,
            actor: PLAYER,
            state,
            perspective: holderPerspective(state, {
              kind: 'CHARACTER',
              characterId: 'elowen-starwhisper',
            }),
            actingCharacterId: 'elowen-starwhisper',
            context: VIEW,
          },
        );
        if (ranked.ranking.source === 'deterministic' && ranked.actions !== VIEW.actions) {
          throw new Error('deterministic actions changed');
        }
        return {
          status: ranked.ranking.status,
          result: ranked.ranking.source,
          issues: [],
          traceId: ranked.ranking.traceId,
          value: ranked,
        };
      }
    }
  }

  /** A local provider that counts its calls and answers as the genuine one does. */
  function countingLocal() {
    const genuine = createLocalProvider();
    const counter = { calls: 0 };
    const local = testBrand('local', 'local', (request, attempt) => {
      counter.calls += 1;
      return genuine.generate(request, attempt);
    });
    return { local, counter };
  }

  async function run(
    capability: Capability,
    route: (local: RoutedProvider) => readonly RoutedProvider[],
  ): Promise<CapabilityRun> {
    const { local, counter } = countingLocal();
    const traces = new InMemoryAiTraceStore();
    const answered = await answer(capability, route(local), traces, {});
    const [trace] = traces.all();
    if (!trace) throw new Error('no trace');
    const { status, result, issues } = answered;
    return { status, result, issues, trace, attempts: trace.attempts, localCalls: counter.calls };
  }

  /** Runs with a given journal, deadline or session; nothing is assumed about traces. */
  async function runWith(
    capability: Capability,
    route: (local: RoutedProvider) => readonly RoutedProvider[],
    options: RunOptions = {},
  ): Promise<CapabilityAnswer & { readonly localCalls: number }> {
    const { local, counter } = countingLocal();
    const answered = await answer(
      capability,
      route(local),
      options.traces ?? new InMemoryAiTraceStore(),
      options,
    );
    return { ...answered, localCalls: counter.calls };
  }

  return Object.assign(run, { runWith });
}
