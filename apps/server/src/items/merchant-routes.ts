import { campaignIdSchema, entityIdSchema, type MerchantOfferResponse } from '@ltw/contracts';
import { merchantOffer } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { withPerspective, type RouteDependencies } from '../http/request-context.ts';
import { wordedItem } from './srd-words.ts';

/**
 * A merchant's offer over HTTP (docs/adr/0057-encounters-maps-loot.md §8), in the ADR 0009 order:
 * to a character at its place, or to the DM; anyone else, and an NPC that is no merchant, is
 * answered as not found. Buying and selling are the World Engine's commands.
 */
const params = z.object({ campaignId: campaignIdSchema, npcId: entityIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerMerchantRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/merchants/:npcId', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { state, perspective } = ready.context;
    const offer = merchantOffer(state, perspective, ready.params.npcId);
    if (!offer) return sendError(reply, request, 'NOT_FOUND');
    const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
    const body: MerchantOfferResponse = {
      ...offer,
      stock: offer.stock.map((item) => wordedItem(item, language)),
      offers: offer.offers.map((item) => wordedItem(item, language)),
    };
    return reply.send(body);
  });
}
