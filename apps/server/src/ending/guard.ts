import type { FastifyInstance } from 'fastify';

import { sendError } from '../http/errors.ts';
import type { EndingStore } from './ending-store.ts';

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * What a finished campaign still takes (docs/adr/0072-keepsakes.md §2): its end and its
 * keepsakes, the last evening's stars, table talk and cheers, what its screens show, and who may
 * come in or must go. Everything else that changes a campaign is play, and is refused: a route added later
 * is refused until it is named here.
 */
export const OPEN_WHEN_FINISHED: ReadonlySet<string> = new Set([
  '/campaigns/:campaignId/ending',
  '/campaigns/:campaignId/keepsakes',
  '/campaigns/:campaignId/reflections',
  '/campaigns/:campaignId/chat',
  // Applause for the last page (ADR 0072 §3): table talk without words; nothing is stored.
  '/campaigns/:campaignId/cheers',
  // The table's screens: the stars and the book may be shown, a screen paired or put away.
  '/campaigns/:campaignId/display/cast',
  '/campaigns/:campaignId/displays',
  '/campaigns/:campaignId/displays/:displayId/name',
  '/campaigns/:campaignId/displays/:displayId/revoke',
  '/campaigns/:campaignId/displays/revoke',
  '/campaigns/:campaignId/table-link/close',
  // Who reads it: an invitation for someone who comes to read, a seat taken back, a link reset.
  '/campaigns/:campaignId/invitations',
  '/campaigns/:campaignId/invitations/:invitationId/revoke',
  '/campaigns/:campaignId/members/:characterId/reset',
  '/campaigns/:campaignId/members/:characterId/revoke',
  // Opening it from the account, and the workshop's own sign-in, change sign-ins only.
  '/account/campaigns/:campaignId/enter',
  '/workshop/campaigns/:campaignId/sign-in',
]);

/**
 * A finished campaign is read, not played: every request that would change it, but for the few
 * above, is refused with 409 `FINISHED` before its body is read — as an away campaign's are
 * (`campaigns/move/guard.ts`), which is asked first.
 */
export function registerFinishedGuard(app: FastifyInstance, store: EndingStore): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!CHANGES.has(request.method)) return;
    if (OPEN_WHEN_FINISHED.has(request.routeOptions.url ?? '')) return;
    const campaignId = (request.params as { readonly campaignId?: unknown } | undefined)
      ?.campaignId;
    if (typeof campaignId !== 'string') return;
    if ((await store.read(campaignId)) === null) return;
    return sendError(reply, request, 'FINISHED');
  });
}
