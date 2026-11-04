import {
  SPELL_SCROLL_COSTS,
  campaignIdSchema,
  type CraftingResponse,
  type ItemEntry,
} from '@ltw/contracts';
import { craftingView, itemEntry } from '@ltw/domain';
import { spellIn, srdSpell } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { withPerspective, type RouteDependencies } from '../http/request-context.ts';
import { entryIn } from './srd-words.ts';

/**
 * Crafting over HTTP (docs/adr/0057-encounters-maps-loot.md §9), in the ADR 0009 order: the DM
 * reads every project, a character its own and what it can make and scribe; any other perspective
 * is answered as not found. Each thing and tool is named in the campaign's language, each spell
 * with its level and its scroll's days and cost. Beginning, giving up and downtime are the World
 * Engine's commands.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerCraftingRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/crafting', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { state, perspective } = ready.context;
    const view = craftingView(state, perspective);
    if (!view) return sendError(reply, request, 'NOT_FOUND');
    const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
    const named = (entry: ItemEntry | undefined, fallback: string) =>
      entry ? entryIn(entry, language).name[language] : fallback;
    const body: CraftingResponse = {
      perspective: perspective.label,
      projects: view.projects.map(({ projectId, project, crafter, helpers }) => ({
        projectId,
        crafter,
        helpers,
        name: project.name,
        quantity: project.quantity,
        hoursNeeded: project.hoursNeeded,
        hoursDone: project.hoursDone,
        workers: 1 + helpers.length,
      })),
      recipes: view.recipes
        .map(({ entry, toolId, days, materialsCp }) => ({
          catalogId: entry.itemId,
          name: named(entry, entry.itemId),
          toolId,
          toolName: named(itemEntry(toolId), toolId),
          days,
          materialsCp,
          stackable: entry.stackable,
        }))
        .sort((a, b) => a.toolName.localeCompare(b.toolName) || a.name.localeCompare(b.name)),
      scrolls: view.scribable
        .flatMap((spellId) => {
          const spell = srdSpell(spellId);
          const cost = spell ? SPELL_SCROLL_COSTS[spell.level] : undefined;
          return spell && cost
            ? [
                {
                  spellId,
                  name: spellIn(spell, language).value.name,
                  level: spell.level,
                  days: cost.days,
                  costCp: cost.costCp,
                },
              ]
            : [];
        })
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
      helpers: view.helpers,
      maxHelpers: view.maxHelpers,
      busy: view.busy,
      purseCp: view.purseCp,
      coinage: view.coinage,
    };
    return reply.send(body);
  });
}
