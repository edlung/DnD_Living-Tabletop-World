import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  type EventStore,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort, type Dice } from '@ltw/rules';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import boundary from '../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
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

/** Engine over the full Ravenford seed; checks roll from `dice` (scripted in tests). */
export async function seededEngine(
  store: EventStore = new InMemoryEventStore(),
  dice: Dice = scriptedDice([]),
) {
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
    checks: skillCheckPort(dice),
  });
  const seed = await loadRavenfordSeed();
  for (const submission of seed.submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
  }
  return engine;
}

export async function ravenfordApp(engine?: WorldEngine): Promise<FastifyInstance> {
  const app = buildApp({
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

/** Response body without the per-request ID, for comparing error responses. */
export function withoutRequestId(response: LightMyRequestResponse): unknown {
  const body = response.json<Record<string, unknown>>();
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'requestId'));
  return { status: response.statusCode, ...rest };
}
