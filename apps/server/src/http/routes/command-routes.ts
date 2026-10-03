import { campaignIdSchema, type CommandResult } from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../request-context.ts';

/**
 * World Engine commands over HTTP (docs/adr/0009-http-api-and-dev-authentication.md).
 * The actor comes from authentication only; the body cannot name an actor
 * or campaign. Client command IDs are namespaced per actor, so callers can
 * never collide with, or probe, anyone else's command IDs.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const body = z
  .object({
    commandId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    command: z.object({ type: z.string() }).loose(),
    expectedVersion: z.number().int().min(0).optional(),
    reason: z.string().max(1000).optional(),
  })
  .strict();

export function httpCommandId(actorId: string, clientCommandId: string): string {
  return `http:${actorId}:${clientCommandId}`;
}

export function registerCommandRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.post('/campaigns/:campaignId/commands', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const input = parseInput(body, request.body, request, reply);
    if (!input) return reply;
    if (input.command.type === 'CreateCampaign')
      return sendError(reply, request, 'INVALID_REQUEST');

    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    if (campaignRole(state, actor) === null) return sendError(reply, request, 'NOT_FOUND');

    const result = await deps.engine.execute({
      commandId: httpCommandId(actor.actorId, input.commandId),
      campaignId: path.campaignId,
      actor,
      command: input.command,
      ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    request.log.info(
      { actorId: actor.actorId, commandType: input.command.type, status: result.status },
      'command submitted',
    );
    if (result.status === 'rejected' && result.code === 'FORBIDDEN') {
      return sendError(reply, request, 'FORBIDDEN');
    }
    return reply.code(statusOf(result)).send(result);
  });
}

function statusOf(result: CommandResult): number {
  if (result.status !== 'rejected') return 200;
  switch (result.code) {
    case 'INVALID_COMMAND':
      return 400;
    case 'VERSION_MISMATCH':
    case 'COMMAND_ID_CONFLICT':
    case 'CONCURRENCY_CONFLICT':
      return 409;
    default:
      return 422;
  }
}
