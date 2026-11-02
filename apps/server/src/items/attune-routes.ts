import {
  attuneRequestSchema,
  campaignIdSchema,
  entityIdSchema,
  type AttunedResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TableDependencies } from '../dice/roll-access.ts';
import { statusOf } from '../http/command-status.ts';
import { sendError } from '../http/errors.ts';
import { withBody, type RouteDependencies } from '../http/request-context.ts';
import { TABLE_ACTOR } from '../rest/rest-routes.ts';

/**
 * Attunement at the table (docs/adr/0054-items-as-data.md §5): a player attunes their own character
 * to an item it carries, or ends that, during the Short Rest the DM opened — the table's system
 * actor records it, as it records a spent Hit Point Die; the DM attunes or ends any time, and only
 * the DM lifts a curse. The World Engine decides the rest: three at most, one copy each, who may.
 */
const params = z.object({ campaignId: campaignIdSchema, itemId: entityIdSchema }).strict();

export function registerAttuneRoutes(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly table: TableDependencies },
): void {
  app.post('/campaigns/:campaignId/items/:itemId/attune', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: attuneRequestSchema });
    if (!ready) return reply;
    const { perspective, state } = ready.context;
    const { campaignId, itemId } = ready.params;
    const { requestId, characterId, attuned, liftCurse } = ready.body;
    const dm = perspective.kind === 'DM';
    const own = perspective.kind === 'CHARACTER' && perspective.holderId === characterId;
    if ((!dm && !own) || (liftCurse === true && !dm)) return sendError(reply, request, 'FORBIDDEN');
    // A player attunes in a Short Rest, never in a fight.
    if (!dm) {
      const open = await deps.table.rests.openRest(campaignId);
      if (state.encounter !== null || open?.kind !== 'short')
        return sendError(reply, request, 'CONFLICT');
    }
    const commandId = `attune:${requestId}:${itemId}`;
    const answer: AttunedResponse = { status: attuned ? 'attuned' : 'unattuned' };
    if (state.commands.has(commandId)) return reply.send(answer);
    const result = await deps.engine.execute({
      campaignId,
      commandId,
      actor: dm ? ready.context.actor : TABLE_ACTOR,
      command: {
        type: 'AttuneItem',
        characterId,
        itemId,
        attuned,
        ...(liftCurse ? { liftCurse } : {}),
      },
    });
    if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
    return reply.send(answer);
  });
}
