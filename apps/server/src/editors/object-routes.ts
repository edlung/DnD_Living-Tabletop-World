import {
  campaignIdSchema,
  entityIdSchema,
  type CommandRejected,
  type KernelCommand,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { dmCampaignState } from '../http/dm-campaign.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { httpCommandId } from '../http/routes/command-routes.ts';

/**
 * A story object made by the DM (docs/adr/0058-campaign-content.md §1): a unique thing with its name
 * and words, given to someone or left at a place — the World Engine's `CreateEntity`, then a
 * `GrantItem` with no catalog entry to its holder (ADR 0039). One request, two of the DM's commands
 * whose IDs follow from it, so a retry makes it once and the DM's history lists both.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
export const storyObjectRequestSchema = z
  .object({
    requestId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).optional(),
    /** Exactly one: who carries it, or where it lies. */
    holderId: entityIdSchema.optional(),
    locationId: entityIdSchema.optional(),
  })
  .strict()
  .refine((body) => (body.holderId === undefined) !== (body.locationId === undefined), {
    message: 'A story object is carried or lies somewhere',
  });

export function registerObjectRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.post('/campaigns/:campaignId/story-objects', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(storyObjectRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const state = await dmCampaignState(request, reply, deps, actor, path.campaignId);
    if (!state) return reply;
    const prefix = httpCommandId(actor.actorId, `object.${body.requestId}`);
    const itemId = `item-${body.requestId.replaceAll('-', '').slice(0, 8)}`;
    const commands: { commandId: string; command: KernelCommand }[] = [
      {
        commandId: `${prefix}.make`,
        command: {
          type: 'CreateEntity',
          entityId: itemId,
          kind: 'item',
          name: body.name,
          ...(body.description ? { description: body.description } : {}),
          existsSince: null,
          ...(body.locationId ? { placement: { locationId: body.locationId, since: null } } : {}),
        },
      },
      ...(body.holderId
        ? [
            {
              commandId: `${prefix}.give`,
              command: {
                type: 'GrantItem' as const,
                itemId,
                holderId: body.holderId,
                quantity: 1,
              },
            },
          ]
        : []),
    ];
    for (const { commandId, command } of commands) {
      if ((await deps.engine.load(path.campaignId))?.state.commands.has(commandId)) continue;
      const result = await deps.engine.execute({
        commandId,
        campaignId: path.campaignId,
        actor,
        command,
      });
      if (result.status === 'rejected') {
        const rejected: CommandRejected = result;
        return reply.code(statusOf(rejected)).send(rejected);
      }
    }
    return reply.send({ status: 'made', itemId });
  });
}
