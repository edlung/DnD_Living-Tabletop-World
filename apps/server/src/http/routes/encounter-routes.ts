import {
  campaignIdSchema,
  type EncounterResponse,
  type EncounterSuggestionResponse,
} from '@ltw/contracts';
import { encounterView, suggestMonsterTurn } from '@ltw/combat';
import { campaignRole, commanderOf, currentCombatant } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import {
  authenticate,
  parseInput,
  withPerspective,
  type RouteDependencies,
} from '../request-context.ts';

/**
 * The running encounter as a perspective sees it (docs/adr/0015-combat-engine.md §6).
 * `encounter: null` whenever the perspective takes no part in a running
 * encounter, so a player cannot tell a fight elsewhere from no fight. The
 * DM alone may ask what the creature whose turn it is should do
 * (docs/adr/0020-npc-intelligence.md §5); nothing acts by itself.
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

  app.get('/campaigns/:campaignId/encounter/suggestion', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (role === null || !state) return sendError(reply, request, 'NOT_FOUND');
    if (role === 'DM') {
      const body: EncounterSuggestionResponse = { suggestion: suggestMonsterTurn(state) };
      return reply.send(body);
    }
    if (role !== 'PLAYER') return sendError(reply, request, 'FORBIDDEN');
    // A creature's commander (ADR 0044 §7) reads the suggestion for its turn only — without the
    // DM's words, which name creatures the player may not know: the client words it from its view.
    const current = state.encounter ? currentCombatant(state.encounter) : undefined;
    const commander = current ? commanderOf(state, current.entityId) : null;
    if (commander === null || state.roster.get(commander) !== actor.actorId) {
      return sendError(reply, request, 'FORBIDDEN');
    }
    const suggestion = suggestMonsterTurn(state);
    const body: EncounterSuggestionResponse = {
      suggestion: suggestion === null ? null : { ...suggestion, explanation: '' },
    };
    return reply.send(body);
  });
}
