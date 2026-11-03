import {
  CapabilityRouter,
  InMemoryAiTraceStore,
  createLocalProvider,
  type AttemptContext,
  type ProviderKind,
  type ProviderRequest,
  type ProviderResponse,
  type RelevanceDeps,
  type RoutedProvider,
} from '@ltw/ai';
import { createCombatEngine } from '@ltw/combat';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  submissionsFromScript,
  type EntropySource,
  type EventStore,
} from '@ltw/domain';
import { preparedEncounterBookSchema, questBookSchema } from '@ltw/contracts';
import { scriptedDice, skillCheckPort, type Dice } from '@ltw/rules';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import boundary from '../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import npcBoundary from '../../../../fixtures/ravenford/npc-boundary.json' with { type: 'json' };
import encounterBook from '../../../../fixtures/ravenford/encounters.json' with { type: 'json' };
import questBook from '../../../../fixtures/ravenford/quests.json' with { type: 'json' };
import ruEncounterBook from '../../../../fixtures/ravenford-ru/encounters.json' with { type: 'json' };
import ruQuestBook from '../../../../fixtures/ravenford-ru/quests.json' with { type: 'json' };
import type { PreparedEncounterBooks } from '../combat/prepared-encounters.ts';
import { InMemoryAssetContentStore, type AssetContentStore } from '../assets/content-store.ts';
import { InMemoryProposalStore } from '../authoring/proposal-store.ts';
import type { AuthoringDependencies } from '../authoring/service.ts';
import type { DmDependencies } from '../dm/dm-routes.ts';
import { InMemoryDmNoteStore } from '../dm/note-store.ts';
import { InMemorySubstitutionStore } from '../dm/substitution-store.ts';
import type { TableDependencies } from '../dice/roll-access.ts';
import type { AccountingDiagnostics } from '../http/routes/ai-routes.ts';
import { loadDevPersonaAuthenticator } from '../http/auth.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { DEFAULT_PERSONAS_FILE } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { memoryDiagnose } from './memory-journal.ts';
import { characterBuilder } from '../characters/builder-port.ts';

/** Test support (excluded from builds): the HTTP app over a seeded Ravenford. */
export const TOKENS = {
  dm: 'dev-dm-ravenford',
  player: 'dev-player-elowen',
  outsider: 'dev-outsider',
} as const;

export const ASHEN_CIRCLE_ID = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';
export const EXPECTED_VISIBLE: Readonly<Record<string, readonly string[]>> = boundary.visible;
export const FORBIDDEN_MARKERS: Readonly<Record<string, readonly string[]>> =
  boundary.forbiddenMarkers;
export const ALL_SECRET_MARKERS = [...new Set(Object.values(FORBIDDEN_MARKERS).flat())];

/** Combat dice at the middle face (11 on a d20). */
export const MIDDLE_ENTROPY: EntropySource = { next: () => 2 ** 31 };

/** Engine over the full Ravenford seed; checks roll from `dice`, combat from `entropy`. */
export async function seededEngine(
  store: EventStore = new InMemoryEventStore(),
  dice: Dice = scriptedDice([]),
  entropy: EntropySource = MIDDLE_ENTROPY,
  /** The fixtures to seed from: `fixtures/ravenford-ru/` for the Russian campaign (ADR 0031). */
  fixturesDir?: string,
) {
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(dice),
    combat: createCombatEngine(),
    characters: characterBuilder,
    entropy,
  });
  const seed = await loadRavenfordSeed(fixturesDir);
  for (const submission of seed.submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
  }
  return engine;
}

/** Gate 04 fixture: the NPC dialogue boundary markers (`fixtures/ravenford/npc-boundary.json`). */
export const NPC_BOUNDARY = npcBoundary;

/** Plants the NPC dialogue boundary markers in a seeded engine, as the DM. */
export async function plantNpcBoundary(engine: WorldEngine): Promise<void> {
  for (const submission of submissionsFromScript({
    campaignId: 'ravenford',
    actor: { actorId: 'dm-ravenford', kind: 'user' },
    commands: npcBoundary.commands,
    commandIdPrefix: 'ravenford.npc-boundary',
  })) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`npc boundary rejected: ${result.code}`);
  }
}

/**
 * A test-only routable provider made from a fake (docs/adr/0032-live-ai.md, B1). It has the
 * router's brand and no server identity: `composeRouter` (runtime and evaluation) refuses it, so it
 * reaches only the routers test support builds directly.
 */
export function testProvider(
  id: string,
  kind: ProviderKind,
  generate: (request: ProviderRequest, attempt: AttemptContext) => Promise<ProviderResponse>,
): RoutedProvider {
  return { id, kind, generate } as unknown as RoutedProvider;
}

/** A provider that records each request and answers as `inner` does. */
export function recording(inner: RoutedProvider = createLocalProvider()): RoutedProvider & {
  readonly requests: ProviderRequest[];
} {
  const requests: ProviderRequest[] = [];
  const provider = testProvider(inner.id, inner.kind, (request, attempt) => {
    requests.push(request);
    return inner.generate(request, attempt);
  });
  return Object.assign(provider, { requests });
}

/**
 * A deterministic AI gateway for DM intents, NPC replies, and relevance: the
 * given providers (default: local only; relevance then has none, as without
 * a key), in-memory traces with their lifecycle-only accounting diagnostic, and a 60 s
 * whole-request deadline. Relevance waits at most 2 s by default.
 */
export function testAiGateway(...providers: RoutedProvider[]): RelevanceDeps & {
  readonly traces: InMemoryAiTraceStore;
  readonly diagnostics: AccountingDiagnostics;
} {
  const ids = new SequentialIds(0xa1);
  const clock = new SteppingClock();
  let ms = 0;
  const routed = providers.length > 0 ? providers : [createLocalProvider()];
  const traces = new InMemoryAiTraceStore();
  return {
    router: new CapabilityRouter({
      reasoning: routed,
      'npc-dialogue': routed,
      narrative: routed,
      'fast-context': providers,
    }),
    relevanceBudgetMs: 2_000,
    traces,
    diagnostics: { diagnose: (campaignId, traceId) => memoryDiagnose(traces, campaignId, traceId) },
    ids,
    clock: { now: () => clock.now(), nowMs: () => (ms += 5) },
    requestTimeoutMs: 60_000,
  };
}

/** Deterministic authoring dependencies with in-memory proposals. */
export function testAuthoring(): AuthoringDependencies & {
  readonly proposals: InMemoryProposalStore;
} {
  const clock = new SteppingClock();
  return {
    proposals: new InMemoryProposalStore(),
    ids: new SequentialIds(0xa2),
    clock: { now: () => clock.now() },
  };
}

/** The DM's table tools (ADR 0033 §6–7) with in-memory substitution reasons. */
export function testDm(): DmDependencies & { readonly substitutions: InMemorySubstitutionStore } {
  const clock = new SteppingClock();
  return {
    substitutions: new InMemorySubstitutionStore(),
    notes: new InMemoryDmNoteStore(),
    clock: { now: () => clock.now() },
  };
}

/** Ravenford's quest definitions (`fixtures/ravenford/quests.json`), validated. */
export const RAVENFORD_QUESTS = questBookSchema.parse(questBook).quests;

/** Ravenford's quest books by language, as production loads them (Stage 605). */
export const RAVENFORD_QUESTS_BY_LANGUAGE = {
  en: RAVENFORD_QUESTS,
  ru: questBookSchema.parse(ruQuestBook).quests,
};

/** Ravenford's prepared encounters by language (`encounters.json`), validated (Stage 605). */
export const RAVENFORD_PREPARED: PreparedEncounterBooks = {
  en: preparedEncounterBookSchema.parse(encounterBook).encounters,
  ru: preparedEncounterBookSchema.parse(ruEncounterBook).encounters,
};

/** In-memory asset contents for an app under test. */
export const testAssets = () => ({ contents: new InMemoryAssetContentStore() });

export async function ravenfordApp(
  engine?: WorldEngine,
  ai: RelevanceDeps = testAiGateway(),
  authoring: AuthoringDependencies = testAuthoring(),
  contents: AssetContentStore = new InMemoryAssetContentStore(),
  dm: DmDependencies = testDm(),
  table?: TableDependencies,
): Promise<FastifyInstance> {
  // The production composition, live session included (ADR 0033), as the browser tests use it.
  const { app } = buildLiveApp({
    ai,
    authoring,
    dm,
    ...(table ? { table } : {}),
    assets: { contents },
    quests: RAVENFORD_QUESTS,
    questsByLanguage: RAVENFORD_QUESTS_BY_LANGUAGE,
    preparedEncounters: RAVENFORD_PREPARED,
    engine: engine ?? (await seededEngine()),
    authenticator: await loadDevPersonaAuthenticator(DEFAULT_PERSONAS_FILE),
    logger: createLogger({ service: 'http-test', level: 'silent' }),
  });
  await app.ready();
  return app;
}

export function get(
  app: FastifyInstance,
  url: string,
  token?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

export function post(
  app: FastifyInstance,
  url: string,
  body: unknown,
  token?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url,
    payload: body as Record<string, unknown>,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/** Response body without the per-request ID, for comparing error responses. */
export function withoutRequestId(response: LightMyRequestResponse): unknown {
  const body = response.json<Record<string, unknown>>();
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'requestId'));
  return { status: response.statusCode, ...rest };
}
