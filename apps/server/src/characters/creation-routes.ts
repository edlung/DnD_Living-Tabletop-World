import {
  campaignIdSchema,
  characterChoicesSchema,
  entityIdSchema,
  type CharacterCreatedResponse,
  type CharacterOptionsResponse,
  type CharacterPreviewResponse,
} from '@ltw/contracts';
import { campaignOptions, campaignRole } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { characterBuilder } from './builder-port.ts';
import { characterOptions } from './options.ts';

/**
 * The character builder's routes (docs/adr/0056-characters-from-the-srd.md §2): what it offers
 * the campaign, a preview of the choices, and the character made through the World Engine. The
 * DM makes one for anyone — for the player of a character named, or to invite a player to — and
 * a seated player makes their own. A player's actor never leaves the server.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const previewBody = z.object({ choices: characterChoicesSchema }).strict();
const createBody = z
  .object({
    /** A retry with the same ID makes the same character once. */
    requestId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    choices: characterChoicesSchema,
    /** The DM's: the new character goes to the player of this one. */
    forPlayerOf: entityIdSchema.optional(),
  })
  .strict();

/** Preview dice: the average face, so a preview never draws the World Engine's randomness. */
const AVERAGE_D6 = () => 4;

export function registerCharacterCreationRoutes(
  app: FastifyInstance,
  deps: RouteDependencies,
): void {
  const atTable = async (campaignId: string, actor: Parameters<typeof campaignRole>[1]) => {
    const snapshot = await deps.engine.load(campaignId);
    const role = campaignRole(snapshot?.state ?? null, actor);
    return snapshot && (role === 'DM' || role === 'PLAYER') ? { snapshot, role } : null;
  };

  app.get('/campaigns/:campaignId/character-options', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const table = await atTable(path.campaignId, actor);
    if (!table) return sendError(reply, request, 'NOT_FOUND');
    const { state } = table.snapshot;
    const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
    const body: CharacterOptionsResponse = {
      ...characterOptions(language),
      startingLevel: campaignOptions(state).startingLevel,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/characters/preview', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(previewBody, request.body, request, reply);
    if (!body) return reply;
    const table = await atTable(path.campaignId, actor);
    if (!table) return sendError(reply, request, 'NOT_FOUND');
    const language = table.snapshot.state.campaign?.language === 'ru' ? 'ru' : 'en';
    const built = characterBuilder.build(body.choices, AVERAGE_D6, language);
    const preview: CharacterPreviewResponse = built.ok
      ? {
          problems: [],
          sheet: built.sheet,
          items: built.items.map(({ catalogId, name, quantity }) => ({
            catalogId,
            name,
            quantity,
          })),
        }
      : { problems: built.problems, sheet: null, items: [] };
    return reply.send(preview);
  });

  app.post('/campaigns/:campaignId/characters', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(createBody, request.body, request, reply);
    if (!body) return reply;
    const table = await atTable(path.campaignId, actor);
    if (!table) return sendError(reply, request, 'NOT_FOUND');
    const { state } = table.snapshot;
    let player: string | undefined;
    if (table.role === 'PLAYER') {
      if (body.forPlayerOf !== undefined) return sendError(reply, request, 'FORBIDDEN');
      player = actor.actorId;
    } else if (body.forPlayerOf !== undefined) {
      player = state.roster.get(body.forPlayerOf);
      if (player === undefined) return sendError(reply, request, 'NOT_FOUND');
    }
    const commandId = `characters.create.${body.requestId}`;
    const result = await deps.engine.execute({
      commandId,
      campaignId: path.campaignId,
      actor,
      command: {
        type: 'CreateCharacter',
        name: body.name,
        choices: body.choices,
        ...(player === undefined ? {} : { playerActorId: player }),
      },
    });
    request.log.info({ status: result.status }, 'character made');
    if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
    // The character this command made, a retry's too.
    const history = (await deps.engine.load(path.campaignId))?.history ?? [];
    const made = history.find(
      (event) =>
        event.type === 'EntityCreated' &&
        event.payload.kind === 'character' &&
        event.causation.commandId === commandId,
    );
    if (made?.type !== 'EntityCreated') return sendError(reply, request, 'NOT_FOUND');
    const created: CharacterCreatedResponse = { characterId: made.payload.entityId };
    return reply.code(result.status === 'duplicate' ? 200 : 201).send(created);
  });
}
