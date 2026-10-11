import type { AiAttemptView, AiTraceView, EntityContextView } from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  checkTalk,
  chronicleEntries,
  holderPerspective,
  npcDialogueContext,
} from '@ltw/domain';

import { renderChronicle } from '../chronicle.ts';
import { replyAsNpc } from '../dialogue.ts';
import { interpretDmIntent } from '../intent.ts';
import { createLocalProvider } from '../local-provider.ts';
import type { ProviderRequest, RoutedProvider } from '../providers.ts';
import { rankContextActions } from '../relevance.ts';
import { CapabilityRouter } from '../router.ts';
import { InMemoryAiTraceStore } from '../traces.ts';
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

export async function capabilityHarness() {
  const world = await seedRavenford({ dialogue: true });
  const { state } = world;
  const clock = new SteppingClock();

  return async function run(
    capability: Capability,
    route: (local: RoutedProvider) => readonly RoutedProvider[],
  ): Promise<CapabilityRun> {
    const genuine = createLocalProvider();
    let localCalls = 0;
    const local = testBrand('local', 'local', (request, attempt) => {
      localCalls += 1;
      return genuine.generate(request, attempt);
    });
    const traces = new InMemoryAiTraceStore();
    const providers = route(local);
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
    };
    const done = (status: string, result: unknown, issues: readonly string[]) => {
      const [trace] = traces.all();
      if (!trace) throw new Error('no trace');
      return { status, result, issues, trace, attempts: trace.attempts, localCalls };
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
        return done(response.status, response.proposal, response.issues);
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
          actor: PLAYER,
          context,
          intent: { kind: 'talk' },
          accepted: true,
          commandId: null,
          line: null,
        });
        return done(reply.status, reply.text, []);
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
        return done(rendered.status, rendered.prose.provider, []);
      }
      case 'relevance': {
        const ranked = await rankContextActions(
          { ...deps, relevanceBudgetMs: 2_000 },
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
        return done(ranked.ranking.status, ranked.ranking.source, []);
      }
    }
  };
}
