import { createHash } from 'node:crypto';

import {
  campaignIdSchema,
  entityIdSchema,
  type CopyableCharactersResponse,
  type CharacterCreatedResponse,
} from '@ltw/contracts';
import { campaignRole, type WorldState } from '@ltw/domain';
import { copiedSheet, totalLevel } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AccountStore } from '../accounts/account-store.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { TABLE_ACTOR } from '../rest/rest-routes.ts';

/**
 * A character in another campaign (docs/FULL_GAME_PLAN.md decision 15; docs/adr/0056-characters-
 * from-the-srd.md §5): a login holds seats in several campaigns; a player is offered the
 * characters they play in the others and brings one here as a sheet only — fresh, never with what
 * it knew or carried. The server reads that sheet from the other campaign itself: nothing of it
 * comes from the client. Without logins (persona play) nothing is offered.
 */
const params = z.object({ campaignId: campaignIdSchema }).strict();
const copyBody = z
  .object({ requestId: z.uuid(), fromCampaignId: campaignIdSchema, characterId: entityIdSchema })
  .strict();

/** Where the party is: the first played character's place. */
const partyPlace = (state: WorldState): string | null => {
  for (const characterId of state.roster.keys()) {
    const place = state.entities.get(characterId)?.placement?.locationId;
    if (place) return place;
  }
  return null;
};

export function registerCopyRoutes(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly accounts: AccountStore },
): void {
  /** The characters the login of this campaign's actor plays in its other campaigns. */
  const elsewhere = async (
    campaignId: string,
    actorId: string,
  ): Promise<CopyableCharactersResponse['characters']> => {
    const seat = await deps.accounts.seatOfActor(campaignId, actorId);
    if (!seat) return [];
    const found: CopyableCharactersResponse['characters'][number][] = [];
    for (const other of await deps.accounts.seats(seat.accountId)) {
      if (other.campaignId === campaignId) continue;
      const state = (await deps.engine.load(other.campaignId))?.state;
      const actor = { actorId: other.actorId, kind: 'user' } as const;
      if (!state?.campaign || campaignRole(state, actor) !== 'PLAYER') continue;
      for (const [characterId, player] of state.roster) {
        const sheet = state.characterSheets.get(characterId);
        if (player !== other.actorId || !sheet) continue;
        found.push({
          campaignId: other.campaignId,
          campaignName: state.campaign.name,
          characterId,
          name: state.entities.get(characterId)?.name ?? characterId,
          level: totalLevel(sheet),
          classes: sheet.classes.map(({ classId, level }) => ({ classId, level })),
        });
      }
    }
    return found;
  };

  const seated = async (
    request: Parameters<typeof authenticate>[0],
    reply: Parameters<typeof authenticate>[1],
  ) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return null;
    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    if (campaignRole(state, actor) !== 'PLAYER' || !state) {
      await sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { actor, campaignId: path.campaignId, state };
  };

  app.get('/campaigns/:campaignId/characters/copyable', async (request, reply) => {
    const ready = await seated(request, reply);
    if (!ready) return reply;
    const body: CopyableCharactersResponse = {
      characters: await elsewhere(ready.campaignId, ready.actor.actorId),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/characters/copy', async (request, reply) => {
    const ready = await seated(request, reply);
    if (!ready) return reply;
    const body = parseInput(copyBody, request.body, request, reply);
    if (!body) return reply;
    const source = (await elsewhere(ready.campaignId, ready.actor.actorId)).find(
      (one) => one.campaignId === body.fromCampaignId && one.characterId === body.characterId,
    );
    const sheet = source
      ? (await deps.engine.load(source.campaignId))?.state.characterSheets.get(source.characterId)
      : undefined;
    if (!source || !sheet) return sendError(reply, request, 'NOT_FOUND');
    // One request makes one character: its ID and its commands' follow from the request.
    const entityId = `character-${createHash('sha256').update(body.requestId).digest('hex').slice(0, 8)}`;
    const place = partyPlace(ready.state);
    const steps = [
      [
        'entity',
        {
          type: 'CreateEntity',
          entityId,
          kind: 'character',
          name: source.name,
          existsSince: null,
          ...(place ? { placement: { locationId: place, since: null } } : {}),
        },
      ],
      ['sheet', { type: 'SetCharacterSheet', entityId, sheet: copiedSheet(sheet) }],
      [
        'assign',
        { type: 'AssignCharacter', characterId: entityId, playerActorId: ready.actor.actorId },
      ],
    ] as const;
    for (const [step, command] of steps) {
      const commandId = `copy.${body.requestId}.${step}`;
      const state = (await deps.engine.load(ready.campaignId))?.state;
      if (state?.commands.has(commandId)) continue;
      const result = await deps.engine.execute({
        campaignId: ready.campaignId,
        commandId,
        actor: TABLE_ACTOR,
        command,
      });
      if (result.status === 'rejected') return sendError(reply, request, 'CONFLICT');
    }
    const made: CharacterCreatedResponse = { characterId: entityId };
    return reply.code(201).send(made);
  });
}
