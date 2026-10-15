import { campaignIdSchema, type PresenceResponse } from '@ltw/contracts';
import { knownEntities, type ResolvedPerspective, type WorldState } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { PresenceSource } from './registry.ts';

/**
 * Presence (docs/adr/0033-live-session.md §5): for each character of the perspective's own
 * entity view, whether its controlling player holds a live subscription, and whether the DM
 * does. The list is the existing `knownEntities` projection, so a hidden character is never
 * listed; actor IDs never leave the server. A character without a player is simply absent
 * from the table, so presence tells no one who controls what beyond who is connected.
 */
export function presenceView(
  state: WorldState,
  perspective: ResolvedPerspective,
  connected: (actorId: string) => boolean,
): PresenceResponse {
  const dm = state.campaign?.dmActorId;
  return {
    perspective: perspective.label,
    dmConnected: dm !== undefined && connected(dm),
    characters: knownEntities(state, perspective)
      .filter((entity) => entity.kind === 'character')
      .map((character) => {
        const player = state.roster.get(character.entityId);
        return { character, present: player !== undefined && connected(player) };
      }),
  };
}

export interface PresenceRouteDependencies extends RouteDependencies {
  readonly presence: PresenceSource;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerPresenceRoutes(
  app: FastifyInstance,
  deps: PresenceRouteDependencies,
): void {
  app.get('/campaigns/:campaignId/presence', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const body = presenceView(context.state, context.perspective, (actorId) =>
      deps.presence.connected(path.campaignId, actorId),
    );
    return reply.send(body);
  });
}
