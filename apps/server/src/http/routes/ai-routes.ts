import { interpretDmIntent, type IntentDeps } from '@ltw/ai';
import { campaignIdSchema, dmIntentRequestSchema } from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../request-context.ts';

/**
 * The AI gateway over HTTP (docs/adr/0017-ai-gateway.md §6), DM only, with
 * the ADR 0009 check order. A proposal is returned for review and is never
 * committable here: no route submits it. Logs carry the trace ID and status,
 * never the DM's text or the provider's output.
 */
export interface AiRouteDependencies extends RouteDependencies {
  readonly ai: IntentDeps;
}

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const traceParams = z
  .object({ campaignId: campaignIdSchema, traceId: z.string().regex(/^[0-9a-f-]{36}$/) })
  .strict();

export function registerAiRoutes(app: FastifyInstance, deps: AiRouteDependencies): void {
  app.post('/campaigns/:campaignId/ai/intents', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(campaignParams, request.params, request, reply);
    if (!params) return reply;
    const body = parseInput(dmIntentRequestSchema, request.body, request, reply);
    if (!body) return reply;

    const state = (await deps.engine.load(params.campaignId))?.state ?? null;
    const outcome = await interpretDmIntent(deps.ai, {
      campaignId: params.campaignId,
      state,
      actor,
      text: body.text,
    });
    if (!outcome.ok) return sendError(reply, request, outcome.reason);
    request.log.info(
      {
        actorId: actor.actorId,
        traceId: outcome.response.traceId,
        status: outcome.response.status,
      },
      'ai intent',
    );
    return reply.send(outcome.response);
  });

  app.get('/campaigns/:campaignId/ai/traces/:traceId', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(traceParams, request.params, request, reply);
    if (!params) return reply;

    const state = (await deps.engine.load(params.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (role === null) return sendError(reply, request, 'NOT_FOUND');
    if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const trace = await deps.ai.traces.get(params.campaignId, params.traceId);
    if (!trace) return sendError(reply, request, 'NOT_FOUND');
    return reply.send(trace);
  });
}
