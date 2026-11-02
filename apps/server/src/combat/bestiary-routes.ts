import { createHash } from 'node:crypto';

import {
  addFromBestiaryRequestSchema,
  bestiaryMonsterIdSchema,
  campaignIdSchema,
  type AddedFromBestiaryResponse,
  type BestiaryEntryResponse,
  type BestiaryResponse,
  type CommandRejected,
} from '@ltw/contracts';
import { JOIN_REFUSALS, joinRefusal } from '@ltw/combat';
import type { WorldState } from '@ltw/domain';
import { SRD_MONSTERS, srdMonster, srdMonsterBlock } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { dmCampaignState } from '../http/dm-campaign.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';

/**
 * The DM's bestiary (docs/adr/0053-monsters-as-data.md §3): the SRD's 330 stat blocks, found on the
 * DM screen; one added to the campaign is a new creature with that stat block at the fight's place
 * (or the party's), through the World Engine as the DM's own commands, and joins a running fight
 * on the square named. A retry of the same request adds nothing more.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const entryParams = z
  .object({ campaignId: campaignIdSchema, monsterId: bestiaryMonsterIdSchema })
  .strict();

const LIST: BestiaryResponse = {
  monsters: SRD_MONSTERS.map((monster) => ({
    monsterId: monster.monsterId,
    name: monster.name,
    size: monster.size,
    type: monster.type,
    challenge: monster.challenge.rating,
    xp: monster.challenge.xp,
    armorClass: monster.armorClass,
    hitPoints: monster.hitPoints.average,
  })),
};

function placeOf(state: WorldState): string | null {
  if (state.encounter) return state.encounter.locationId;
  for (const entity of state.entities.values()) {
    if (entity.kind === 'character' && entity.placement) return entity.placement.locationId;
  }
  return null;
}

export function registerBestiaryRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  // The ADR 0009 order: 401, then 400, then 404 and 403.
  app.get('/campaigns/:campaignId/bestiary', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    if (!(await dmCampaignState(request, reply, deps, actor, path.campaignId))) return reply;
    return reply.send(LIST);
  });

  app.get('/campaigns/:campaignId/bestiary/:monsterId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    if (!(await dmCampaignState(request, reply, deps, actor, path.campaignId))) return reply;
    const monster = srdMonster(path.monsterId);
    if (!monster) return sendError(reply, request, 'NOT_FOUND');
    const body: BestiaryEntryResponse = { monster };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/bestiary/:monsterId/add', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(entryParams, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(addFromBestiaryRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const state = await dmCampaignState(request, reply, deps, actor, path.campaignId);
    if (!state) return reply;
    const monster = srdMonster(path.monsterId);
    const block = srdMonsterBlock(path.monsterId);
    const locationId = placeOf(state);
    if (!monster || !block || !locationId) return sendError(reply, request, 'NOT_FOUND');
    // An opaque id from the request: a retry names the same creature (ADR 0037's opaque ids).
    const entityId = `creature-${createHash('sha256').update(`${path.campaignId}:${body.requestId}`).digest('hex').slice(0, 8)}`;
    const prefix = `bestiary.${body.requestId}`;
    const commands = [
      {
        commandId: `${prefix}.create`,
        command: {
          type: 'CreateEntity' as const,
          entityId,
          kind: 'creature' as const,
          name: body.name ?? monster.name,
          existsSince: null,
          placement: { locationId, since: null },
        },
      },
      {
        commandId: `${prefix}.block`,
        command: { type: 'SetStatBlock' as const, entityId, statBlock: block.statBlock },
      },
      ...(state.encounter && body.square
        ? [
            {
              commandId: `${prefix}.join`,
              command: {
                type: 'AddCombatant' as const,
                entityId,
                side: body.side ?? ('hostile' as const),
                position: body.square,
              },
            },
          ]
        : []),
    ];
    // A square the creature cannot take is refused before anything is written: no creature is
    // left behind in the campaign, and the DM tries another square (the engine checks again).
    const refused =
      state.encounter && body.square && !state.commands.has(`${prefix}.join`)
        ? joinRefusal(
            state,
            state.encounter,
            { position: body.square, size: block.statBlock.size ?? 'medium' },
            entityId,
          )
        : null;
    if (refused !== null) {
      const rejected: CommandRejected = {
        status: 'rejected',
        commandId: `${prefix}.join`,
        code: 'INVALID_ENCOUNTER',
        message: JOIN_REFUSALS[refused],
        details: { square: refused },
      };
      return reply.code(statusOf(rejected)).send(rejected);
    }
    for (const { commandId, command } of commands) {
      if ((await deps.engine.load(path.campaignId))?.state.commands.has(commandId)) continue;
      const result = await deps.engine.execute({
        commandId,
        campaignId: path.campaignId,
        actor,
        command,
      });
      if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
    }
    request.log.info({ monsterId: path.monsterId }, 'creature added from the bestiary');
    const added: AddedFromBestiaryResponse = {
      status: 'added',
      entityId,
      fighting: commands.length === 3,
    };
    return reply.send(added);
  });
}
