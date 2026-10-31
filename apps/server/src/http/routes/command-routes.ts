import { campaignIdSchema, type CommandResult } from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../command-status.ts';
import { sendError } from '../errors.ts';
import { authenticate, limitKey, parseInput, type RouteDependencies } from '../request-context.ts';

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
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const input = parseInput(body, request.body, request, reply);
    if (!input) return reply;
    // Authoring commits only through its proposals (docs/adr/0018-ai-authoring.md §6),
    // chapters only through the chronicle route, which renders them (ADR 0024 §4), and a
    // member's release only through the members route, which revokes their sessions first
    // (docs/adr/0036-production-sign-in.md §4).
    if (
      input.command.type === 'CreateCampaign' ||
      input.command.type === 'BootstrapCampaign' ||
      input.command.type === 'ApplyAuthoring' ||
      input.command.type === 'GenerateChronicle' ||
      input.command.type === 'ReleaseCharacter'
    ) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }

    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (role === null) return sendError(reply, request, 'NOT_FOUND');
    // Stream versions are campaign metadata players never see (ADR 0008, ADR 0014 §4).
    if (role === 'PLAYER' && input.expectedVersion !== undefined) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    // An image request is limited per actor like AI work (ADR 0036 §6), in invitation mode.
    const slot =
      deps.limits && input.command.type === 'RequestAsset'
        ? deps.limits.expensive(limitKey({ actor, campaignId: path.campaignId }))
        : undefined;
    if (slot === null) return sendError(reply, request, 'RATE_LIMITED');
    let result: CommandResult;
    try {
      result = await deps.engine.execute({
        commandId: httpCommandId(actor.actorId, input.commandId),
        campaignId: path.campaignId,
        actor,
        command: input.command,
        ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
    } finally {
      slot?.release();
    }
    request.log.info(
      { actorId: actor.actorId, commandType: input.command.type, status: result.status },
      'command submitted',
    );
    if (result.status === 'rejected' && result.code === 'FORBIDDEN') {
      return sendError(reply, request, 'FORBIDDEN');
    }
    return reply.code(statusOf(result)).send(role === 'PLAYER' ? forPlayer(result) : result);
  });
}

/**
 * What a player sees of a result (ADR 0014 §4): never the event list (types,
 * sequences, counts) and never rejection details, which could reveal DM
 * structure or stream metadata. Schema issues about the player's own input
 * are kept.
 */
export function forPlayer(result: CommandResult): CommandResult {
  if (result.status === 'rejected') {
    const { details, ...rest } = result;
    return result.code === 'INVALID_COMMAND' && details !== undefined ? result : rest;
  }
  const { status, commandId, campaignId, outcome } = result;
  return { status, commandId, campaignId, events: [], ...(outcome ? { outcome } : {}) };
}
