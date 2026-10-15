import { campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { LiveHub } from './hub.ts';
import { responseSink, STREAM_HEADERS } from './stream.ts';

/**
 * `GET /campaigns/:campaignId/live?perspective=<p>[&focus=<entityId>][&place=<locationId>]`
 * (docs/adr/0033-live-session.md §1). The full check order of ADR 0009 (401 → 400 → 404 → 403)
 * answers before the stream opens; the query is strict, and focus and place must match the
 * object-ID pattern. After that the stream carries only `ready`, `changed`, `closed` and
 * heartbeats. The credential stays in the `Authorization` header and is never logged.
 */
export interface LiveRouteDependencies extends RouteDependencies {
  readonly hub: LiveHub;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z
  .object({
    perspective: z.string(),
    focus: entityIdSchema.optional(),
    place: entityIdSchema.optional(),
  })
  .strict();

export function registerLiveRoute(app: FastifyInstance, deps: LiveRouteDependencies): void {
  app.get('/campaigns/:campaignId/live', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path, query: input } = ready;
    const dmPreview =
      campaignRole(context.state, context.actor) === 'DM' && context.perspective.kind !== 'DM';
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { ...STREAM_HEADERS, 'x-request-id': request.id });
    raw.flushHeaders();
    await deps.hub.open({
      target: {
        campaignId: path.campaignId,
        perspective: input.perspective,
        kind: context.perspective.kind,
        focus: input.focus ?? null,
        place: input.place ?? null,
        identity: !dmPreview,
      },
      authorization: request.headers.authorization ?? '',
      actorId: context.actor.actorId,
      sink: responseSink(raw),
    });
    return reply;
  });
}
