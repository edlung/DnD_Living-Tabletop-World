import { parsePerspective } from '@ltw/contracts';
import {
  resolvePerspective,
  type Actor,
  type ResolvedPerspective,
  type WorldEngine,
  type WorldState,
} from '@ltw/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { Authenticator } from './auth.ts';
import { sendError } from './errors.ts';

/**
 * The fixed check order of every campaign request (ADR 0009):
 * authenticate (401) → validate input (400) → membership (404) →
 * perspective permission (403). Returns null after sending the error.
 */
export interface RouteDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
}

export function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: RouteDependencies,
): Actor | null {
  const actor = deps.authenticator.authenticate(request.headers.authorization);
  if (!actor) sendError(reply, request, 'UNAUTHENTICATED');
  return actor;
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
  const actor = authenticate(request, reply, deps);
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

  const state = (await deps.engine.load(params.campaignId))?.state ?? null;
  const access = resolvePerspective(state, actor, perspectiveRequest);
  if (!access.ok || state === null) {
    sendError(reply, request, access.ok ? 'NOT_FOUND' : access.reason);
    return null;
  }
  request.log.info(
    { actorId: actor.actorId, perspective: access.perspective.label },
    'knowledge query',
  );
  return { context: { actor, state, perspective: access.perspective }, params, query };
}
