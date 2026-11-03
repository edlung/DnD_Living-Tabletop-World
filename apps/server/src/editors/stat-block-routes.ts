import { campaignIdSchema, entityIdSchema, type StatBlockResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { dmCampaignState } from '../http/dm-campaign.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';

/**
 * A creature's or an NPC's stat block, for the DM's editor (docs/adr/0058-campaign-content.md §1):
 * the DM reads it to set its Armor Class, Hit Points and Speed by hand, through `SetStatBlock`. The
 * ADR 0009 order: 401, 400, then 404 for anyone outside the campaign, 403 for a player, and 404 for
 * a thing with no block.
 */
const params = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();

export function registerStatBlockRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/entities/:entityId/stat-block', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const state = await dmCampaignState(request, reply, deps, actor, path.campaignId);
    if (!state) return reply;
    const statBlock = state.statBlocks.get(path.entityId);
    if (!statBlock) return sendError(reply, request, 'NOT_FOUND');
    const body: StatBlockResponse = { entityId: path.entityId, statBlock };
    return reply.send(body);
  });
}
