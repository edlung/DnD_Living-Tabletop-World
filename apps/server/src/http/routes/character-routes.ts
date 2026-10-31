import { campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import { characterSheetView, inventoryView } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

const params = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerCharacterRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/entities/:entityId/sheet', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const body = characterSheetView(context.state, context.perspective, path.entityId);
    if (!body) return sendError(reply, request, 'NOT_FOUND');
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/entities/:entityId/inventory', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const body = inventoryView(context.state, context.perspective, path.entityId);
    if (!body) return sendError(reply, request, 'NOT_FOUND');
    return reply.send(body);
  });
}
