import { campaignRole, type Actor, type WorldState } from '@ltw/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { sendError } from './errors.ts';
import type { RouteDependencies } from './request-context.ts';

/**
 * The campaign's state when its DM asks (the DM's catalogs: the bestiary, the item catalog); a
 * stranger finds no campaign (404), a player is refused (403). The answer is sent on failure.
 */
export async function dmCampaignState(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: RouteDependencies,
  actor: Actor,
  campaignId: string,
): Promise<WorldState | null> {
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null || state === null) {
    await sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  if (role !== 'DM') {
    await sendError(reply, request, 'FORBIDDEN');
    return null;
  }
  return state;
}
