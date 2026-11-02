import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  campaignIdSchema,
  entityIdSchema,
  preparedEncounterBookSchema,
  startPreparedEncounterRequestSchema,
  type Language,
  type PreparedEncounter,
  type PreparedEncounterListResponse,
  type PreparedEncounterView,
  type StartedPreparedEncounterResponse,
} from '@ltw/contracts';
import { campaignRole, isCombatant, type Actor, type WorldState } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { errorBody, sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import {
  RAVENFORD_FIXTURES_DIR,
  RAVENFORD_RU_FIXTURES_DIR,
} from '../world-engine/ravenford-seed.ts';

/**
 * Prepared encounters (Stage 605; docs/adr/0015-combat-engine.md, amendment of 2026-11-02): the
 * fights an adventure has ready at a place. The DM lists them and starts one in a single step —
 * the foes who can still fight are placed there, then `StartCombat` runs with them where they
 * stand and the party's characters at the place at the party's starting squares — all through
 * the World Engine as the DM, under command IDs derived from the request, so a retried request
 * starts nothing twice. Ravenford's books come from its fixtures, in the campaign's language; a
 * campaign the workshop prepared has none here.
 */
export type PreparedEncounterBooks = Readonly<
  Partial<Record<Language, readonly PreparedEncounter[]>>
>;

export async function loadPreparedEncounterBooks(): Promise<PreparedEncounterBooks> {
  const read = async (directory: string) =>
    preparedEncounterBookSchema.parse(
      JSON.parse(await readFile(join(directory, 'encounters.json'), 'utf8')),
    ).encounters;
  return { en: await read(RAVENFORD_FIXTURES_DIR), ru: await read(RAVENFORD_RU_FIXTURES_DIR) };
}

export interface PreparedEncounterDependencies extends RouteDependencies {
  readonly preparedEncounters?: PreparedEncounterBooks;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const startParams = z
  .object({ campaignId: campaignIdSchema, encounterId: z.string().min(1).max(60) })
  .strict();

/** The encounters of a campaign: Ravenford's, in its language; none for a prepared campaign. */
function encountersOf(books: PreparedEncounterBooks | undefined, state: WorldState) {
  if (!books || !state.campaign || state.bootstrap) return [];
  return books[state.campaign.language] ?? [];
}

/** A foe who can still fight: a creature or person that exists, is not destroyed, has hit points. */
function canFight(state: WorldState, entityId: string): boolean {
  const entity = state.entities.get(entityId);
  const block = state.statBlocks.get(entityId);
  return (
    entity !== undefined &&
    entity.status !== 'destroyed' &&
    block !== undefined &&
    block.hitPoints.current > 0 &&
    !isCombatant(state, entityId)
  );
}

/** The party's characters at a place, by name: who joins, in that order. */
function partyAt(state: WorldState, locationId: string, room: number) {
  return [...state.entities.values()]
    .filter(
      (entity) =>
        entity.kind === 'character' &&
        entity.status !== 'destroyed' &&
        entity.placement?.locationId === locationId,
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.entityId.localeCompare(b.entityId))
    .slice(0, room);
}

/** The DM's view of one encounter; null when this campaign does not hold its place or foes. */
export function preparedView(
  state: WorldState,
  encounter: PreparedEncounter,
): PreparedEncounterView | null {
  const location = state.entities.get(encounter.locationId);
  if (location?.kind !== 'location') return null;
  if (!encounter.foes.some((foe) => state.entities.has(foe.entityId))) return null;
  const foes = encounter.foes.filter((foe) => canFight(state, foe.entityId)).length;
  const party = partyAt(state, encounter.locationId, encounter.partyStart.length).map(
    ({ entityId, kind, name }) => ({ entityId, kind, name }),
  );
  return {
    encounterId: encounter.encounterId,
    title: encounter.title,
    summary: encounter.summary,
    location: { entityId: location.entityId, kind: location.kind, name: location.name },
    foes,
    party,
    blocked:
      state.encounter !== null
        ? 'in-combat'
        : foes === 0
          ? 'no-foes'
          : party.length === 0
            ? 'no-party'
            : null,
  };
}

/** The campaign as its DM holds it (404 for a non-member, 403 for anyone else); null once answered. */
async function dmState(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: PreparedEncounterDependencies,
  actor: Actor,
  campaignId: string,
): Promise<{ actor: Actor; state: WorldState } | null> {
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null || state === null) {
    await sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  if (role !== 'DM') {
    await sendError(reply, request, 'FORBIDDEN');
    return null;
  }
  return { actor, state };
}

export function registerPreparedEncounterRoutes(
  app: FastifyInstance,
  deps: PreparedEncounterDependencies,
): void {
  // The ADR 0009 order: 401, then 400, then 404 and 403.
  app.get('/campaigns/:campaignId/encounters/prepared', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const body: PreparedEncounterListResponse = {
      encounters: encountersOf(deps.preparedEncounters, dm.state).flatMap((encounter) => {
        const view = preparedView(dm.state, encounter);
        return view === null ? [] : [view];
      }),
    };
    return reply.send(body);
  });

  app.post(
    '/campaigns/:campaignId/encounters/prepared/:encounterId/start',
    async (request, reply) => {
      const actor = await authenticate(request, reply, deps);
      if (!actor) return reply;
      const path = parseInput(startParams, request.params, request, reply);
      if (!path) return reply;
      const body = parseInput(startPreparedEncounterRequestSchema, request.body, request, reply);
      if (!body) return reply;
      const dm = await dmState(request, reply, deps, actor, path.campaignId);
      if (!dm) return reply;
      const encounter = encountersOf(deps.preparedEncounters, dm.state).find(
        (candidate) => candidate.encounterId === path.encounterId,
      );
      const view = encounter ? preparedView(dm.state, encounter) : null;
      if (!encounter || !view) return sendError(reply, request, 'NOT_FOUND');
      const prefix = `prepared.${encounter.encounterId}.${body.requestId}`;
      if (view.blocked !== null) {
        // A retry of a start that already ran: the fight it started is the one running.
        if (dm.state.commands.has(`${prefix}.start`)) {
          const started: StartedPreparedEncounterResponse = {
            status: 'started',
            encounterId: encounter.encounterId,
          };
          return reply.send(started);
        }
        return reply.code(409).send({ ...errorBody('CONFLICT', request.id), reason: view.blocked });
      }
      const foes = encounter.foes.filter((foe) => canFight(dm.state, foe.entityId));
      for (const [index, foe] of foes.entries()) {
        if (dm.state.entities.get(foe.entityId)?.placement?.locationId === encounter.locationId) {
          continue;
        }
        const placed = await deps.engine.execute({
          commandId: `${prefix}.place.${String(index)}`,
          campaignId: path.campaignId,
          actor: dm.actor,
          command: {
            type: 'PlaceEntity',
            entityId: foe.entityId,
            locationId: encounter.locationId,
          },
        });
        if (placed.status === 'rejected') return reply.code(statusOf(placed)).send(placed);
      }
      const party = view.party.map((character, index) => ({
        entityId: entityIdSchema.parse(character.entityId),
        side: 'party' as const,
        position: encounter.partyStart[index] ?? encounter.partyStart[0],
      }));
      const started = await deps.engine.execute({
        commandId: `${prefix}.start`,
        campaignId: path.campaignId,
        actor: dm.actor,
        command: {
          type: 'StartCombat',
          locationId: encounter.locationId,
          battlefield: encounter.battlefield,
          combatants: [
            ...party,
            ...foes.map((foe) => ({
              entityId: foe.entityId,
              side: 'hostile' as const,
              position: foe.position,
            })),
          ],
        },
      });
      if (started.status === 'rejected') return reply.code(statusOf(started)).send(started);
      request.log.info({ encounterId: encounter.encounterId }, 'prepared encounter started');
      const response: StartedPreparedEncounterResponse = {
        status: 'started',
        encounterId: encounter.encounterId,
      };
      return reply.send(response);
    },
  );
}
