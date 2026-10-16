import { rankContextActions, type RelevanceDeps } from '@ltw/ai';
import { campaignIdSchema, entityIdSchema, type EntityContextResponse } from '@ltw/contracts';
import { entityContext } from '@ltw/context';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { expensive, withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * Entity context for an acting character (docs/adr/0012-context-engine.md,
 * docs/adr/0009-http-api-and-dev-authentication.md). Perspectives without
 * an acting character are refused from the perspective alone (403), before
 * the entity is looked up; an entity the character neither perceives nor
 * knows is a 404 identical to a nonexistent one.
 *
 * `ranking=ai` asks the relevance ranker to re-rate the legal actions within
 * a time budget (docs/adr/0021-ai-relevance.md); without it, or on any
 * failure, the deterministic context is returned unchanged. Logs carry the
 * ranking's status and trace ID only. A request that names a ranking is AI
 * work: in invitation mode it takes the actor's expensive-request slot right
 * after authentication, like every AI route (docs/adr/0036-production-sign-in.md,
 * amendment 2026-10-16).
 */
export interface ContextRouteDependencies extends RouteDependencies {
  readonly ai: RelevanceDeps;
}

const entityParams = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const contextQuery = z
  .object({ perspective: z.string(), ranking: z.literal('ai').optional() })
  .strict();

/** Any `ranking` in the raw query may reach the ranker (only `ai` is valid; the rest are 400). */
const namesRanking = (request: FastifyRequest): boolean =>
  (request.query as Record<string, unknown> | null)?.['ranking'] !== undefined;

export function registerContextRoutes(app: FastifyInstance, deps: ContextRouteDependencies): void {
  const answer = async (request: FastifyRequest, reply: FastifyReply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: entityParams,
      query: contextQuery,
    });
    if (!ready) return reply;
    const { context, params, query } = ready;
    const result = entityContext(context.state, context.perspective, params.entityId);
    if (!result.ok) {
      return sendError(reply, request, result.reason === 'NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN');
    }
    const ranked =
      query.ranking === 'ai'
        ? await rankContextActions(deps.ai, {
            campaignId: params.campaignId,
            actor: context.actor,
            state: context.state,
            perspective: context.perspective,
            actingCharacterId: result.actingCharacterId,
            context: result.context,
          })
        : null;
    if (ranked) {
      request.log.info(
        { status: ranked.ranking.status, traceId: ranked.ranking.traceId },
        'context ranked',
      );
    }
    const body: EntityContextResponse = {
      perspective: context.perspective.label,
      actingCharacterId: result.actingCharacterId,
      worldTime: context.state.clock,
      context: ranked ? { ...result.context, actions: ranked.actions } : result.context,
      ranking: ranked?.ranking ?? {
        source: 'deterministic',
        status: 'NOT_REQUESTED',
        traceId: null,
      },
    };
    return reply.send(body);
  };
  app.get('/campaigns/:campaignId/entities/:entityId/context', expensive(answer, namesRanking));
}
