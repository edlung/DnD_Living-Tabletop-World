import { campaignIdSchema, type EncounterResponse } from '@ltw/contracts';
import { encounterView } from '@ltw/combat';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * The running encounter as a perspective sees it (docs/adr/0015-combat-engine.md §6).
 * `encounter: null` whenever the perspective takes no part in a running
 * encounter, so a player cannot tell a fight elsewhere from no fight.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const perspectiveOnly = z.object({ perspective: z.string() }).strict();

export function registerEncounterRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/encounter', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query: perspectiveOnly });
    if (!ready) return reply;
    const { context } = ready;
    const body: EncounterResponse = {
      perspective: context.perspective.label,
      encounter: encounterView(context.state, context.perspective),
    };
    return reply.send(body);
  });
}
