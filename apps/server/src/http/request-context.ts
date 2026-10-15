import { parsePerspective } from '@ltw/contracts';
import {
  resolvePerspective,
  type Actor,
  type RecordedEvent,
  type ResolvedPerspective,
  type WorldEngine,
  type WorldState,
} from '@ltw/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { RequestLimits, Slot } from '../auth/limits.ts';
import { actorFor, type Authenticator, type Credentials, type Principal } from './auth.ts';
import { sendError } from './errors.ts';

/**
 * The fixed check order of every campaign request (ADR 0009):
 * authenticate (401) → validate input (400) → membership (404) →
 * perspective permission (403). Returns null after sending the error.
 * An expensive route (AI, images) admits its request right after authentication: 429 over the
 * actor's limits (docs/adr/0036-production-sign-in.md §6), decided from the caller alone.
 */
export interface RouteDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  /** Per-process request limits; absent with development personas (ADR 0036 §6). */
  readonly limits?: RequestLimits;
}

/** The credential headers of a request, for the authenticator and nothing else. */
export const credentialsOf = (request: FastifyRequest): Credentials => ({
  authorization: request.headers.authorization,
  cookie: request.headers.cookie,
});

/** Requests of an expensive route (see `expensive`) and the slot each one holds. */
const EXPENSIVE = new WeakSet<FastifyRequest>();
const SLOTS = new WeakMap<FastifyRequest, Slot>();

/** The key of an actor's expensive-request limits: one per actor within its session's campaign. */
export const limitKey = (principal: Principal): string =>
  `${principal.campaignId ?? ''}\n${principal.actor.actorId}`;

/**
 * Marks a route handler as expensive (AI or image work): its request is admitted against the
 * actor's limits when it authenticates, and its in-flight slot is released when the handler's
 * work is over, whether or not the client is still there.
 */
export function expensive(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  return async (request, reply) => {
    EXPENSIVE.add(request);
    try {
      return await handler(request, reply);
    } finally {
      SLOTS.get(request)?.release();
    }
  };
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: RouteDependencies,
): Promise<Actor | null> {
  const principal = await deps.authenticator.authenticate(credentialsOf(request));
  if (!principal) {
    sendError(reply, request, 'UNAUTHENTICATED');
    return null;
  }
  if (deps.limits && EXPENSIVE.has(request) && !SLOTS.has(request)) {
    const slot = deps.limits.expensive(limitKey(principal));
    if (!slot) {
      request.log.info({ limit: 'expensive' }, 'request limited');
      sendError(reply, request, 'RATE_LIMITED');
      return null;
    }
    SLOTS.set(request, slot);
  }
  return actorFor(principal, (request.params as { campaignId?: unknown } | null)?.campaignId);
}

export function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    sendError(reply, request, 'INVALID_REQUEST');
    return null;
  }
  return parsed.data;
}

export interface PerspectiveContext {
  readonly actor: Actor;
  readonly state: WorldState;
  /** The campaign's recorded events, for views at a past world time (ADR 0023). */
  readonly history: readonly RecordedEvent[];
  readonly perspective: ResolvedPerspective;
}

export async function withPerspective<
  P extends { campaignId: string },
  Q extends { perspective: string },
>(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: RouteDependencies,
  schemas: { readonly params: z.ZodType<P>; readonly query: z.ZodType<Q> },
): Promise<{ context: PerspectiveContext; params: P; query: Q } | null> {
  const actor = await authenticate(request, reply, deps);
  if (!actor) return null;
  const params = parseInput(schemas.params, request.params, request, reply);
  if (!params) return null;
  const query = parseInput(schemas.query, request.query, request, reply);
  if (!query) return null;
  const perspectiveRequest = parsePerspective(query.perspective);
  if (!perspectiveRequest) {
    sendError(reply, request, 'INVALID_REQUEST');
    return null;
  }

  const snapshot = await deps.engine.load(params.campaignId);
  const state = snapshot?.state ?? null;
  const access = resolvePerspective(state, actor, perspectiveRequest);
  if (!access.ok || state === null) {
    sendError(reply, request, access.ok ? 'NOT_FOUND' : access.reason);
    return null;
  }
  request.log.info(
    { actorId: actor.actorId, perspective: access.perspective.label },
    'knowledge query',
  );
  const history = snapshot?.history ?? [];
  return { context: { actor, state, history, perspective: access.perspective }, params, query };
}
