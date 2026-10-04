import { renderChronicle, type IntentDeps } from '@ltw/ai';
import {
  CHRONICLE_LIMITS,
  campaignIdSchema,
  memoryIdSchema,
  parsePerspective,
  worldTimeSchema,
  type ChronicleListResponse,
  type GenerateChronicleResponse,
  type MemorySuggestionsResponse,
} from '@ltw/contracts';
import {
  campaignRole,
  chronicleChapters,
  chronicleEntries,
  flashbackFor,
  memorySuggestions,
  resolvePerspective,
  type IdGenerator,
  type SuggestionScope,
} from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../command-status.ts';
import { sendError } from '../errors.ts';
import {
  authenticate,
  parseInput,
  withPerspective,
  type RouteDependencies,
} from '../request-context.ts';

/**
 * Chronicle (docs/adr/0024-chronicle.md). The DM generates a chapter: its
 * entries are computed from the perspective's memories (or, for the DM, from
 * salient events), a `narrative` provider writes prose from them alone, and
 * `GenerateChronicle` records both if the campaign has not moved meanwhile.
 * A perspective reads its chapters; the DM reads memory suggestions; anyone
 * may open a flashback of a memory it may recall. The generic command route
 * refuses `GenerateChronicle`.
 */
export interface ChronicleRouteDependencies extends RouteDependencies {
  readonly ai: IntentDeps;
  readonly chronicleIds: IdGenerator;
}

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const memoryParams = z.object({ campaignId: campaignIdSchema, memoryId: memoryIdSchema }).strict();
const perspectiveQuery = z.object({ perspective: z.string() }).strict();
const generateBody = z
  .object({
    title: z.string().trim().min(1).max(CHRONICLE_LIMITS.titleChars),
    perspective: z.string().min(1).max(100),
    from: worldTimeSchema,
    to: worldTimeSchema.optional(),
  })
  .strict();
const suggestionQuery = z
  .object({
    scope: z.string().optional(),
    from: z.coerce.number().pipe(worldTimeSchema),
    to: z.coerce.number().pipe(worldTimeSchema).optional(),
  })
  .strict();

export function registerChronicleRoutes(
  app: FastifyInstance,
  deps: ChronicleRouteDependencies,
): void {
  /** The DM's own campaign snapshot, or null after sending 401/400/404/403. */
  const forDm = async <P extends { campaignId: string }>(
    request: FastifyRequest,
    reply: FastifyReply,
    params: z.ZodType<P>,
  ) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return null;
    const parsed = parseInput(params, request.params, request, reply);
    if (!parsed) return null;
    const snapshot = await deps.engine.load(parsed.campaignId);
    const role = campaignRole(snapshot?.state ?? null, actor);
    if (role === null || !snapshot) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    if (role !== 'DM') {
      sendError(reply, request, 'FORBIDDEN');
      return null;
    }
    return { actor, snapshot, params: parsed };
  };

  app.post('/campaigns/:campaignId/chronicle', async (request, reply) => {
    const dm = await forDm(request, reply, campaignParams);
    if (!dm) return reply;
    const body = parseInput(generateBody, request.body, request, reply);
    if (!body) return reply;
    const { actor, snapshot, params } = dm;
    const { state, history } = snapshot;
    const to = body.to ?? state.clock;
    const requested = parsePerspective(body.perspective);
    const access = requested ? resolvePerspective(state, actor, requested) : null;
    if (!access?.ok || body.from > to || to > state.clock) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const draft = chronicleEntries(state, history, access.perspective, body.from, to);
    if (draft.entries.length === 0) return sendError(reply, request, 'UNPROCESSABLE');
    const rendered = await renderChronicle(deps.ai, {
      campaignId: params.campaignId,
      actor,
      state,
      perspective: access.perspective.label,
      title: body.title,
      entries: draft.entries,
    });
    const commandId = `chronicle.${deps.chronicleIds.next()}`;
    const result = await deps.engine.execute({
      commandId,
      campaignId: params.campaignId,
      actor,
      // The entries were computed against this version; a moved campaign is a conflict.
      expectedVersion: state.version,
      command: {
        type: 'GenerateChronicle',
        title: body.title,
        perspective: access.perspective.label,
        from: body.from,
        to,
        prose: rendered.prose,
      },
    });
    request.log.info(
      { status: result.status, rendering: rendered.status, traceId: rendered.traceId },
      'chronicle generated',
    );
    const response: GenerateChronicleResponse = {
      result,
      chronicleId: result.status === 'rejected' ? null : commandId,
      rendering: {
        status: rendered.status,
        provider: rendered.prose.provider,
        traceId: rendered.traceId,
      },
    };
    return reply.code(statusOf(result)).send(response);
  });

  app.get('/campaigns/:campaignId/chronicle', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: campaignParams,
      query: perspectiveQuery,
    });
    if (!ready) return reply;
    const { context } = ready;
    const body: ChronicleListResponse = {
      perspective: context.perspective.label,
      chapters: chronicleChapters(context, context.perspective),
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/chronicle/suggestions', async (request, reply) => {
    const dm = await forDm(request, reply, campaignParams);
    if (!dm) return reply;
    const query = parseInput(suggestionQuery, request.query, request, reply);
    if (!query) return reply;
    const { state, history } = dm.snapshot;
    const raw = query.scope ?? 'PARTY';
    const scope: SuggestionScope | null =
      raw === 'PARTY'
        ? { kind: 'PARTY' }
        : raw.startsWith('CHARACTER:') && state.entities.get(raw.slice(10))?.kind === 'character'
          ? { kind: 'CHARACTER', characterId: raw.slice(10) }
          : null;
    const to = query.to ?? state.clock;
    if (scope === null || query.from > to || to > state.clock) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const body: MemorySuggestionsResponse = {
      scope: raw,
      suggestions: memorySuggestions(state, history, scope, query.from, to),
    };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/memories/:memoryId/flashback', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: memoryParams,
      query: perspectiveQuery,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const flashback = flashbackFor(context, context.perspective, params.memoryId);
    return flashback ? reply.send(flashback) : sendError(reply, request, 'NOT_FOUND');
  });
}
