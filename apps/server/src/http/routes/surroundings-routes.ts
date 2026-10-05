import { campaignIdSchema } from '@ltw/contracts';
import { surroundings } from '@ltw/context';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

/** The same character-only perspective boundary as entity context. */
export function registerSurroundingsRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/surroundings', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { state, perspective } = ready.context;
    const body = surroundings(state, perspective);
    if (!body) return sendError(reply, request, 'FORBIDDEN');
    return reply.send(body);
  });
}
