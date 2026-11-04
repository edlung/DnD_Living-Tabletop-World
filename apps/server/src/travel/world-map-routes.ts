import { campaignIdSchema, type WorldMapResponse } from '@ltw/contracts';
import { worldMapView } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../http/request-context.ts';

/**
 * The world map over HTTP (docs/adr/0057-encounters-maps-loot.md §10), in the ADR 0009 order: every
 * perspective reads the regions it knows, with the places it knows pinned and the routes between
 * them. Pins, routes and journeys are the World Engine's commands.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerWorldMapRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/world-map', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { state, perspective } = ready.context;
    const body: WorldMapResponse = {
      perspective: perspective.label,
      ...worldMapView(state, perspective),
    };
    return reply.send(body);
  });
}
