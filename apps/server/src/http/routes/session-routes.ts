import { campaignIdSchema } from '@ltw/contracts';
import { campaignSession } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../request-context.ts';

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({}).strict();

/** Caller identity and available view choices, never credentials or another player's identity. */
export function registerSessionRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/session', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path || !parseInput(query, request.query, request, reply)) return reply;
    const snapshot = await deps.engine.load(path.campaignId);
    const session = snapshot ? campaignSession(snapshot.state, actor) : null;
    if (!session) return sendError(reply, request, 'NOT_FOUND');
    return reply.send(session);
  });
}
