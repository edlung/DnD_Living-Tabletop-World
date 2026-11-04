import type { FastifyInstance } from 'fastify';

import { sendError } from '../../http/errors.ts';
import type { CampaignMoves } from './moves.ts';

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Opening a campaign from the account changes this server's sign-ins only: an away one is read. */
const READS = new Set(['/account/campaigns/:campaignId/enter']);

/**
 * A campaign away is read, not played (docs/adr/0061-local-mode.md §5): every request that would
 * change it is refused with 409 `MOVED` before its body is read. Requests that name no campaign in
 * their path and still reach one (an invitation redeemed) meet migration 0039's triggers, which
 * the error handler answers the same way (`isAwayRefusal`).
 */
export function registerMoveGuard(app: FastifyInstance, moves: CampaignMoves): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!CHANGES.has(request.method) || READS.has(request.routeOptions.url ?? '')) return;
    const campaignId = (request.params as { readonly campaignId?: unknown } | undefined)
      ?.campaignId;
    if (typeof campaignId !== 'string') return;
    if ((await moves.awayOf(campaignId)) === null) return;
    return sendError(reply, request, 'MOVED');
  });
}

/** PostgreSQL's refusal of an away campaign's write (migration 0039's triggers). */
export function isAwayRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { readonly code?: unknown; readonly message?: unknown };
  return code === '55000' && typeof message === 'string' && message.includes(' is away');
}
