import { campaignIdSchema, type QuestDefinition, type QuestListResponse } from '@ltw/contracts';
import { questLog } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * The party's quest log (docs/adr/0025-ravenford-integration.md §2): a
 * projection computed per request, for the party, its members' own
 * perspectives, and the DM. Any other perspective sees no quest.
 */
export interface QuestRouteDependencies extends RouteDependencies {
  readonly quests: readonly QuestDefinition[];
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerQuestRoutes(app: FastifyInstance, deps: QuestRouteDependencies): void {
  app.get('/campaigns/:campaignId/quests', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context } = ready;
    const body: QuestListResponse = {
      perspective: context.perspective.label,
      quests: questLog(context, context.perspective, deps.quests),
    };
    return reply.send(body);
  });
}
