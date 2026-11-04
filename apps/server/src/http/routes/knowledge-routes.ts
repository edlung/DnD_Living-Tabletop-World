import {
  KNOWLEDGE_TYPES,
  campaignIdSchema,
  entityIdSchema,
  knowledgeIdSchema,
  worldTimeSchema,
  type EntityKnowledgeResponse,
  type KnowledgeListResponse,
  type KnowledgeRecordResponse,
  type KnownEntitiesResponse,
  type RelatedKnowledgeResponse,
} from '@ltw/contracts';
import {
  entityKnowledge,
  getKnowledge,
  knownEntities,
  listKnowledge,
  relatedKnowledge,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * Perspective-scoped knowledge API (docs/adr/0008-knowledge-boundary.md,
 * docs/adr/0009-http-api-and-dev-authentication.md). Every query string is
 * strict: unknown or repeated parameters are invalid.
 */
const perspective = z.string();
const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const knowledgeParams = z
  .object({ campaignId: campaignIdSchema, knowledgeId: knowledgeIdSchema })
  .strict();
const entityParams = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const perspectiveOnly = z.object({ perspective }).strict();
const listQuery = z
  .object({
    perspective,
    type: z.enum(KNOWLEDGE_TYPES).optional(),
    about: entityIdSchema.optional(),
    asOf: z
      .string()
      .regex(/^-?\d{1,13}$/)
      .transform(Number)
      .pipe(worldTimeSchema)
      .optional(),
  })
  .strict();
const relatedQuery = z
  .object({ perspective, depth: z.enum(['1', '2', '3']).transform(Number).optional() })
  .strict();

export function registerKnowledgeRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/knowledge', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: campaignParams,
      query: listQuery,
    });
    if (!ready) return reply;
    const { context, query } = ready;
    const result = listKnowledge(context.state, context.perspective, {
      ...(query.type === undefined ? {} : { knowledgeType: query.type }),
      ...(query.about === undefined ? {} : { subjectId: query.about }),
      ...(query.asOf === undefined ? {} : { asOf: query.asOf }),
    });
    if (!result.ok) return sendError(reply, request, 'INVALID_REQUEST');
    const body: KnowledgeListResponse = {
      perspective: context.perspective.label,
      asOf: query.asOf ?? null,
      knowledge: result.knowledge,
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/knowledge/:knowledgeId', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: knowledgeParams,
      query: perspectiveOnly,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const view = getKnowledge(context.state, context.perspective, params.knowledgeId);
    if (!view) return sendError(reply, request, 'NOT_FOUND');
    const body: KnowledgeRecordResponse = {
      perspective: context.perspective.label,
      knowledge: view,
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/knowledge/:knowledgeId/related', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: knowledgeParams,
      query: relatedQuery,
    });
    if (!ready) return reply;
    const { context, params, query } = ready;
    const related = relatedKnowledge(
      context.state,
      context.perspective,
      params.knowledgeId,
      query.depth ?? 1,
    );
    if (!related) return sendError(reply, request, 'NOT_FOUND');
    const body: RelatedKnowledgeResponse = { perspective: context.perspective.label, ...related };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/entities', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: campaignParams,
      query: perspectiveOnly,
    });
    if (!ready) return reply;
    const { context } = ready;
    const entities = knownEntities(context.state, context.perspective);
    const { activeSceneId, scenes } = context.state;
    const scene = activeSceneId === null ? undefined : scenes.get(activeSceneId);
    const known = scene && entities.some((entity) => entity.entityId === scene.locationId);
    const body: KnownEntitiesResponse = {
      perspective: context.perspective.label,
      entities,
      ...(scene && known ? { scenePlaceId: scene.locationId } : {}),
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/entities/:entityId/knowledge', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: entityParams,
      query: perspectiveOnly,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const about = entityKnowledge(context.state, context.perspective, params.entityId);
    if (!about) return sendError(reply, request, 'NOT_FOUND');
    const body: EntityKnowledgeResponse = { perspective: context.perspective.label, ...about };
    return reply.send(body);
  });
}
