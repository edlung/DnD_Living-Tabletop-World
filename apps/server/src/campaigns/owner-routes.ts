import { campaignIdSchema, workshopIdSchema } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { issueInvitation } from '../auth/sign-in.ts';
import { sendError } from '../http/errors.ts';
import { authorizeWorkshop } from '../workshop/access.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';

const empty = z.object({}).strict();
const listQuery = z.object({ after: workshopIdSchema.optional() }).strict();
const entryPath = z.object({ campaignId: campaignIdSchema }).strict();
const PAGE_SIZE = 25;

/** Explicit workshop ownership links only; ordinary game access still needs normal sign-in. */
export function registerOwnedCampaignRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
): void {
  const repository = deps.activation?.repository;
  if (!repository) return;
  app.get('/workshop/campaigns', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const query = listQuery.safeParse(request.query);
    if (!query.success) return sendError(reply, request, 'INVALID_REQUEST');
    const before = query.data.after
      ? await repository.ownedActivation(session.ownerId, query.data.after)
      : null;
    if (query.data.after && !before) return sendError(reply, request, 'NOT_FOUND');
    const campaigns = await repository.owned(session.ownerId, PAGE_SIZE + 1, before);
    return reply.send({
      campaigns: campaigns.slice(0, PAGE_SIZE),
      nextCursor:
        campaigns.length > PAGE_SIZE ? (campaigns[PAGE_SIZE - 1]?.activationId ?? null) : null,
    });
  });
  app.post('/workshop/campaigns/:campaignId/sign-in', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = entryPath.safeParse(request.params);
    if (
      !path.success ||
      !empty.safeParse(request.body).success ||
      !empty.safeParse(request.query).success
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    const entry = deps.campaignEntry;
    if (!entry) return sendError(reply, request, 'NOT_FOUND');
    const campaign = await repository.ownedCampaign(session.ownerId, path.data.campaignId);
    if (!campaign) return sendError(reply, request, 'NOT_FOUND');
    const snapshot = await entry.engine.load(campaign.campaignId);
    if (snapshot?.state.campaign?.dmActorId !== session.ownerId)
      return sendError(reply, request, 'NOT_FOUND');
    const slot = deps.limits.expensive(`workshop:${session.ownerId}`);
    if (!slot) return sendError(reply, request, 'RATE_LIMITED');
    try {
      const issued = await issueInvitation(entry.signIn, {
        campaignId: campaign.campaignId,
        purpose: 'dm',
        characterId: null,
        actorId: session.ownerId,
        createdBy: `workshop:${session.ownerId}`,
        hours: 1,
      });
      return await reply.send({ link: issued.link, expiresAt: issued.expiresAt });
    } finally {
      slot.release();
    }
  });
}
