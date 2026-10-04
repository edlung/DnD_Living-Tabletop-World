import { campaignIdSchema, entityIdSchema, worldTimeSchema } from '@ltw/contracts';
import { entityPresentationAt, scenePresentationAt } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * World visual state (docs/adr/0023-world-visual-state.md): how an entity
 * or a place looked to a perspective at a world time (`at`, default now).
 * Anything the perspective may not see then, or that did not exist then, is
 * a 404 identical to a nonexistent one. A time after the world clock is 400.
 */
const entityParams = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const locationParams = z
  .object({ campaignId: campaignIdSchema, locationId: entityIdSchema })
  .strict();
/** `at`: a world time in seconds, at most the current clock. */
export const atQuery = z
  .object({ perspective: z.string(), at: z.coerce.number().pipe(worldTimeSchema).optional() })
  .strict();

function resolved<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  view: () => T | null,
): T | FastifyReply {
  try {
    const found = view();
    return found ?? sendError(reply, request, 'NOT_FOUND');
  } catch (error) {
    if (error instanceof RangeError) return sendError(reply, request, 'INVALID_REQUEST');
    throw error;
  }
}

export function registerVisualRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/entities/:entityId/presentation', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: entityParams,
      query: atQuery,
    });
    if (!ready) return reply;
    const { context, params, query } = ready;
    return resolved(request, reply, () =>
      entityPresentationAt(context, context.perspective, params.entityId, query.at ?? null),
    );
  });

  app.get('/campaigns/:campaignId/locations/:locationId/scene', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: locationParams,
      query: atQuery,
    });
    if (!ready) return reply;
    const { context, params, query } = ready;
    return resolved(request, reply, () =>
      scenePresentationAt(context, context.perspective, params.locationId, query.at ?? null),
    );
  });
}
