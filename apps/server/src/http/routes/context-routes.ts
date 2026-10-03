import { campaignIdSchema, entityIdSchema, type EntityContextResponse } from '@ltw/contracts';
import { entityContext } from '@ltw/context';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * Entity context for an acting character (docs/adr/0012-context-engine.md,
 * docs/adr/0009-http-api-and-dev-authentication.md). Perspectives without
 * an acting character are refused from the perspective alone (403), before
 * the entity is looked up; an entity the character neither perceives nor
 * knows is a 404 identical to a nonexistent one.
 */
const entityParams = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const perspectiveOnly = z.object({ perspective: z.string() }).strict();

export function registerContextRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/entities/:entityId/context', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: entityParams,
      query: perspectiveOnly,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const result = entityContext(context.state, context.perspective, params.entityId);
    if (!result.ok) {
      return sendError(reply, request, result.reason === 'NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN');
    }
    const body: EntityContextResponse = {
      perspective: context.perspective.label,
      actingCharacterId: result.actingCharacterId,
      worldTime: context.state.clock,
      context: result.context,
    };
    return reply.send(body);
  });
}
