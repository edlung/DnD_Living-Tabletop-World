import {
  CapabilityRouter,
  InMemoryAiTraceStore,
  createLocalProvider,
  type AiProvider,
  type IntentDeps,
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
import { scriptedDice, skillCheckPort, type Dice } from '@ltw/rules';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import boundary from '../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import npcBoundary from '../../../../fixtures/ravenford/npc-boundary.json' with { type: 'json' };
import { InMemoryProposalStore } from '../authoring/proposal-store.ts';
import type { AuthoringDependencies } from '../authoring/service.ts';
import { buildApp } from '../http/app.ts';
import { loadDevPersonaAuthenticator } from '../http/auth.ts';
import { DEFAULT_PERSONAS_FILE } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

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
) {
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(dice),
    combat: createCombatEngine(),
    entropy,
  });
  const seed = await loadRavenfordSeed();
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
 * A deterministic AI gateway for DM intents and NPC replies: the given
 * providers (default: local only) and in-memory traces.
 */
export function testAiGateway(...providers: AiProvider[]): IntentDeps & {
  readonly traces: InMemoryAiTraceStore;
} {
  const ids = new SequentialIds(0xa1);
  const clock = new SteppingClock();
  let ms = 0;
  const routed = providers.length > 0 ? providers : [createLocalProvider()];
  return {
    router: new CapabilityRouter({ reasoning: routed, 'npc-dialogue': routed }),
    traces: new InMemoryAiTraceStore(),
    ids,
    clock: { now: () => clock.now(), nowMs: () => (ms += 5) },
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

export async function ravenfordApp(
  engine?: WorldEngine,
  ai: IntentDeps = testAiGateway(),
  authoring: AuthoringDependencies = testAuthoring(),
): Promise<FastifyInstance> {
  const app = buildApp({
    ai,
    authoring,
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
