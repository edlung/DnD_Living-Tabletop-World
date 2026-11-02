import { campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { credentialsOf, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { LiveHub } from './hub.ts';
import { responseSink, streamHeaders } from './stream.ts';

/**
 * `GET /campaigns/:campaignId/live?perspective=<p>[&focus=<entityId>][&place=<locationId>]`
 * (docs/adr/0033-live-session.md §1). The full check order of ADR 0009 (401 → 400 → 404 → 403)
 * answers before the stream opens; the query is strict, and focus and place must match the
 * object-ID pattern. After that the stream carries only `ready`, `changed`, `closed` and
 * heartbeats. The credential stays in its header (`Authorization` for development personas, the
 * session cookie in invitation mode) and is never logged. In invitation mode the stream also
 * needs a same-origin request (the app's origin check, docs/adr/0036-production-sign-in.md).
 */
export interface LiveRouteDependencies extends RouteDependencies {
  readonly hub: LiveHub;
  /** The request header that carries the credential: responses vary on it. */
  readonly credentialHeader: 'Authorization' | 'Cookie';
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
    const role = campaignRole(context.state, context.actor);
    const dmPreview = role === 'DM' && context.perspective.kind !== 'DM';
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { ...streamHeaders(deps.credentialHeader), 'x-request-id': request.id });
    raw.flushHeaders();
    await deps.hub.open({
      target: {
        campaignId: path.campaignId,
        perspective: input.perspective,
        kind: context.perspective.kind,
        focus: input.focus ?? null,
        place: input.place ?? null,
        // A display has no identity view (ADR 0042): it reads its own `/display/session`.
        identity: !dmPreview && role !== 'DISPLAY',
        display: role === 'DISPLAY',
      },
      credentials: credentialsOf(request),
      actorId: context.actor.actorId,
      sink: responseSink(raw),
    });
    return reply;
  });
}
