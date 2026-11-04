import {
  campaignIdSchema,
  type Language,
  type QuestDefinition,
  type QuestListResponse,
} from '@ltw/contracts';
import { handQuestsView, questLog } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withPerspective, type RouteDependencies } from '../request-context.ts';
import { sendError } from '../errors.ts';
import type { AdventureBooks } from '../../adventures/adventures.ts';
import type { CampaignQuestBooks } from '../../campaigns/quest-books.ts';

/**
 * The party's quest log (docs/adr/0025-ravenford-integration.md §2): a
 * projection computed per request, for the party, its members' own
 * perspectives, and the DM. Any other perspective sees no quest.
 */
export interface QuestRouteDependencies extends RouteDependencies {
  readonly quests: readonly QuestDefinition[];
  readonly campaignQuests?: CampaignQuestBooks;
  /** Ravenford's books by language (Stage 605); `quests` for a language without one. */
  readonly questsByLanguage?: Readonly<Partial<Record<Language, readonly QuestDefinition[]>>>;
  /** Every other ready adventure's books (docs/adr/0058-campaign-content.md §5). */
  readonly adventures?: Readonly<Record<string, AdventureBooks>>;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerQuestRoutes(app: FastifyInstance, deps: QuestRouteDependencies): void {
  app.get('/campaigns/:campaignId/quests', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context } = ready;
    const language = context.state.campaign?.language ?? 'en';
    const adventure = context.state.campaign?.adventure ?? null;
    // A workshop campaign's own book; a ready adventure's; Ravenford's when it named none.
    const definitions = context.state.bootstrap
      ? await deps.campaignQuests?.get(
          ready.params.campaignId,
          context.state.bootstrap.source.questDigest,
        )
      : adventure !== null
        ? deps.adventures?.[adventure]?.quests[language]
        : (deps.questsByLanguage?.[language] ?? deps.quests);
    if (!definitions) return sendError(reply, request, 'INTERNAL');
    const body: QuestListResponse = {
      perspective: context.perspective.label,
      quests: questLog(context, context.perspective, definitions),
      // The DM's quests by hand (docs/adr/0058-campaign-content.md §2).
      handQuests: handQuestsView(context.state, context.perspective),
    };
    return reply.send(body);
  });
}
