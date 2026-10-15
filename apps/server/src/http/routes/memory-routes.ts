import {
  MEMORY_KINDS,
  campaignIdSchema,
  entityIdSchema,
  memoryIdSchema,
  sessionIdSchema,
  worldTimeSchema,
  type MemoryRecallResponse,
  type MemoryRecordResponse,
  type SessionListResponse,
} from '@ltw/contracts';
import {
  MAX_RECALL_LIMIT,
  campaignRole,
  getMemory,
  listSessions,
  recallMemories,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import {
  authenticate,
  parseInput,
  withPerspective,
  type RouteDependencies,
} from '../request-context.ts';

/**
 * Scoped memory recall and sessions (docs/adr/0010-memory-and-temporal-retrieval.md,
 * docs/adr/0009-http-api-and-dev-authentication.md). Query strings are strict.
 */
const worldTime = z
  .string()
  .regex(/^-?\d{1,13}$/)
  .transform(Number)
  .pipe(worldTimeSchema);
const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const memoryParams = z.object({ campaignId: campaignIdSchema, memoryId: memoryIdSchema }).strict();
const recallQuery = z
  .object({
    perspective: z.string(),
    q: z.string().max(500).optional(),
    entity: entityIdSchema.optional(),
    location: entityIdSchema.optional(),
    from: worldTime.optional(),
    to: worldTime.optional(),
    kind: z.enum(MEMORY_KINDS).optional(),
    session: sessionIdSchema.optional(),
    asOf: worldTime.optional(),
    limit: z
      .string()
      .regex(/^\d{1,2}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(MAX_RECALL_LIMIT))
      .optional(),
  })
  .strict();

export function registerMemoryRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/memories', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: campaignParams,
      query: recallQuery,
    });
    if (!ready) return reply;
    const { context, query } = ready;
    const result = recallMemories(context.state, context.perspective, {
      ...(query.q === undefined ? {} : { text: query.q }),
      ...(query.entity === undefined ? {} : { entityId: query.entity }),
      ...(query.location === undefined ? {} : { locationId: query.location }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      ...(query.kind === undefined ? {} : { memoryKind: query.kind }),
      ...(query.session === undefined ? {} : { sessionId: query.session }),
      ...(query.asOf === undefined ? {} : { asOf: query.asOf }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
    if (!result.ok) return sendError(reply, request, 'INVALID_REQUEST');
    const body: MemoryRecallResponse = {
      perspective: context.perspective.label,
      asOf: query.asOf ?? null,
      total: result.total,
      memories: result.memories,
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/memories/:memoryId', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: memoryParams,
      query: z.object({ perspective: z.string() }).strict(),
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const memory = getMemory(context.state, context.perspective, params.memoryId);
    if (!memory) return sendError(reply, request, 'NOT_FOUND');
    const body: MemoryRecordResponse = { perspective: context.perspective.label, memory };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/sessions', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(campaignParams, request.params, request, reply);
    if (!params) return reply;
    const query = parseInput(z.object({}).strict(), request.query, request, reply);
    if (!query) return reply;
    const state = (await deps.engine.load(params.campaignId))?.state ?? null;
    if (state === null || campaignRole(state, actor) === null) {
      return sendError(reply, request, 'NOT_FOUND');
    }
    const body: SessionListResponse = { sessions: listSessions(state) };
    return reply.send(body);
  });
}
