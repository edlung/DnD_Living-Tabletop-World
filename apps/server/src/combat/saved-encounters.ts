import { createHash } from 'node:crypto';

import {
  campaignIdSchema,
  encounterDifficultyRequestSchema,
  savedEncounterRequestSchema,
  startPreparedEncounterRequestSchema,
  type EncounterDifficultyResponse,
  type EncounterDifficultyView,
  type EntityRef,
  type SavedEncounterRequest,
  type SavedEncounterView,
  type SavedEncountersResponse,
  type SavedFoe,
  type SavedFoeView,
  type StartedPreparedEncounterResponse,
} from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import {
  encounterDifficulty,
  monsterIn,
  squaresOf,
  srdMonster,
  srdMonsterBlock,
  totalLevel,
} from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DmDependencies } from '../dm/dm-routes.ts';
import { statusOf } from '../http/command-status.ts';
import { errorBody, sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { canFight, dmState, partyAt } from './prepared-encounters.ts';
import type { SavedEncounterRecord } from './saved-encounter-store.ts';

/**
 * The DM's encounter builder (docs/adr/0057-encounters-maps-loot.md §1), in the ADR 0009 order
 * (401, 400, then 404 for a non-member and 403 for anyone but the DM): the encounters the DM saved
 * with their difficulty for the party at the place now, written and deleted beside the world, and
 * started in one step through the World Engine as the DM — each bestiary foe made from its stat
 * block and numbered by its kind, the campaign's own creatures placed, then `StartCombat` — under
 * command IDs derived from the request, so a retried request starts nothing twice.
 */
export interface SavedEncounterDependencies extends RouteDependencies {
  readonly dm: DmDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const encounterParams = z.object({ campaignId: campaignIdSchema, encounterId: z.uuid() }).strict();

const language = (state: WorldState) => (state.campaign?.language === 'ru' ? 'ru' : 'en');

/** A foe as the builder shows it, or null when this campaign or the SRD does not hold it. */
function foeView(state: WorldState, foe: SavedFoe): SavedFoeView | null {
  if (foe.kind === 'bestiary') {
    const monster = srdMonster(foe.monsterId);
    const block = srdMonsterBlock(foe.monsterId)?.statBlock;
    if (!monster || !block) return null;
    return {
      foe,
      name: monsterIn(monster, language(state)).value.name,
      challenge: block.challenge?.rating ?? null,
      xp: block.challenge?.xp ?? null,
      size: block.size ?? 'medium',
    };
  }
  const entity = state.entities.get(foe.entityId);
  const block = state.statBlocks.get(foe.entityId);
  if (!entity || entity.kind === 'character' || entity.kind === 'location' || !block) return null;
  return {
    foe,
    name: entity.name,
    challenge: block.challenge?.rating ?? null,
    xp: block.challenge?.xp ?? null,
    size: block.size ?? 'medium',
  };
}

const ref = (entity: { entityId: string; kind: EntityRef['kind']; name: string }): EntityRef => ({
  entityId: entity.entityId,
  kind: entity.kind,
  name: entity.name,
});

/** The foes' XP against the party's levels (docs/adr/0053-monsters-as-data.md §3). */
function difficultyFor(
  state: WorldState,
  party: readonly EntityRef[],
  foes: readonly SavedFoeView[],
): EncounterDifficultyView | null {
  const levels = party.flatMap((member) => {
    const sheet = state.characterSheets.get(member.entityId);
    return sheet ? [totalLevel(sheet)] : [];
  });
  if (levels.length === 0 || foes.length === 0) return null;
  const xp = foes.reduce((sum, foe) => sum + (foe.xp ?? 0), 0);
  const unknown = foes.filter((foe) => foe.xp === null).length;
  return { ...encounterDifficulty(levels, xp), unknown };
}

/**
 * The encounter as the DM sees it. One whose place or a creature is gone from the campaign is still
 * listed — it holds one of the campaign's places — and can only be changed or deleted.
 */
function viewOf(state: WorldState, record: SavedEncounterRecord): SavedEncounterView {
  const { encounter } = record;
  const place = state.entities.get(encounter.locationId);
  const location = place?.kind === 'location' ? ref(place) : null;
  const foes = encounter.foes.map((foe) => foeView(state, foe));
  const shown = foes.filter((foe): foe is SavedFoeView => foe !== null);
  const gone = location === null || shown.length < foes.length;
  const party = gone ? [] : partyAt(state, encounter.locationId, encounter.partyStart.length);
  const unable = encounter.foes.some(
    (foe) => foe.kind === 'creature' && !canFight(state, foe.entityId),
  );
  return {
    encounterId: record.encounterId,
    name: encounter.name,
    location,
    battlefield: encounter.battlefield,
    foes: shown,
    partyStart: encounter.partyStart,
    party: party.map(ref),
    difficulty: gone ? null : difficultyFor(state, party.map(ref), shown),
    blocked: gone
      ? 'gone'
      : state.encounter !== null
        ? 'in-combat'
        : unable
          ? 'no-foes'
          : party.length === 0
            ? 'no-party'
            : null,
    updatedAt: record.updatedAt,
  };
}

/**
 * Why a saved encounter cannot be written in this campaign, or null: its place or a foe unknown,
 * or someone's space off the field, in a wall, or on another's square.
 */
function refusal(state: WorldState, encounter: SavedEncounterRequest): string | null {
  if (state.entities.get(encounter.locationId)?.kind !== 'location') return 'location';
  const foes = encounter.foes.map((foe) => foeView(state, foe));
  if (foes.some((foe) => foe === null)) return 'foe';
  const { width, height } = encounter.battlefield;
  const walls = new Set(
    (encounter.battlefield.walls ?? []).map((w) => `${String(w.x)},${String(w.y)}`),
  );
  const spaces = [
    ...encounter.partyStart.map((position) => squaresOf({ position, size: 'medium' })),
    ...encounter.foes.map((foe, index) =>
      squaresOf({ position: foe.position, size: foes[index]?.size ?? 'medium' }),
    ),
  ];
  const taken = new Set<string>();
  for (const square of spaces.flat()) {
    const key = `${String(square.x)},${String(square.y)}`;
    if (square.x >= width || square.y >= height || walls.has(key) || taken.has(key))
      return 'square';
    taken.add(key);
  }
  return null;
}

/** A bestiary foe's own ID: opaque, and the same for a retried start. */
const foeId = (campaignId: string, requestId: string, index: number) =>
  `creature-${createHash('sha256')
    .update(`${campaignId}:${requestId}:${String(index)}`)
    .digest('hex')
    .slice(0, 8)}`;

export function registerSavedEncounterRoutes(
  app: FastifyInstance,
  deps: SavedEncounterDependencies,
): void {
  const { encounters, clock } = deps.dm;

  app.get('/campaigns/:campaignId/encounters/saved', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const body: SavedEncountersResponse = {
      encounters: (await encounters.list(path.campaignId)).map((record) =>
        viewOf(dm.state, record),
      ),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/encounters/saved/:encounterId', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(encounterParams, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(savedEncounterRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const refused = refusal(dm.state, body);
    if (refused !== null)
      return reply.code(400).send({ ...errorBody('INVALID_REQUEST', request.id), reason: refused });
    const known = (await encounters.get(path.campaignId, path.encounterId)) !== null;
    const record: SavedEncounterRecord = {
      campaignId: path.campaignId,
      encounterId: path.encounterId,
      encounter: body,
      updatedAt: clock.now(),
    };
    if (!(await encounters.put(record))) return sendError(reply, request, 'CONFLICT');
    return reply.code(known ? 200 : 201).send({ encounter: viewOf(dm.state, record) });
  });

  app.post(
    '/campaigns/:campaignId/encounters/saved/:encounterId/delete',
    async (request, reply) => {
      const actor = await authenticate(request, reply, deps);
      if (!actor) return reply;
      const path = parseInput(encounterParams, request.params, request, reply);
      if (!path) return reply;
      const dm = await dmState(request, reply, deps, actor, path.campaignId);
      if (!dm) return reply;
      if (!(await encounters.delete(path.campaignId, path.encounterId)))
        return sendError(reply, request, 'NOT_FOUND');
      return reply.code(204).send();
    },
  );

  app.post('/campaigns/:campaignId/encounters/difficulty', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(encounterDifficultyRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const foes = body.foes.flatMap((foe) => {
      const view = foeView(dm.state, foe);
      return view === null ? [] : [view];
    });
    const party = partyAt(dm.state, body.locationId, 8).map(ref);
    const response: EncounterDifficultyResponse = {
      party,
      foes,
      difficulty: difficultyFor(dm.state, party, foes),
    };
    return reply.send(response);
  });

  app.post('/campaigns/:campaignId/encounters/saved/:encounterId/start', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(encounterParams, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(startPreparedEncounterRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const dm = await dmState(request, reply, deps, actor, path.campaignId);
    if (!dm) return reply;
    const record = await encounters.get(path.campaignId, path.encounterId);
    if (!record) return sendError(reply, request, 'NOT_FOUND');
    const view = viewOf(dm.state, record);
    const prefix = `saved.${path.encounterId}.${body.requestId}`;
    const started: StartedPreparedEncounterResponse = {
      status: 'started',
      encounterId: path.encounterId,
    };
    if (view.blocked !== null) {
      // A retry of a start that already ran: the fight it started is the one running.
      if (dm.state.commands.has(`${prefix}.start`)) return reply.send(started);
      return reply.code(409).send({ ...errorBody('CONFLICT', request.id), reason: view.blocked });
    }
    const { encounter } = record;
    // Each kind of bestiary foe numbered when there are several of it: "Goblin 1", "Goblin 2".
    const kinds = new Map<string, number>();
    for (const foe of encounter.foes)
      if (foe.kind === 'bestiary') kinds.set(foe.monsterId, (kinds.get(foe.monsterId) ?? 0) + 1);
    const seen = new Map<string, number>();
    const commands: { commandId: string; command: Record<string, unknown> }[] = [];
    const combatants = encounter.foes.map((foe, index) => {
      if (foe.kind === 'creature') {
        if (dm.state.entities.get(foe.entityId)?.placement?.locationId !== encounter.locationId)
          commands.push({
            commandId: `${prefix}.foe.${String(index)}.place`,
            command: {
              type: 'PlaceEntity',
              entityId: foe.entityId,
              locationId: encounter.locationId,
            },
          });
        return { entityId: foe.entityId, position: foe.position };
      }
      const entityId = foeId(path.campaignId, body.requestId, index);
      const number = (seen.get(foe.monsterId) ?? 0) + 1;
      seen.set(foe.monsterId, number);
      const name = view.foes[index]?.name ?? foe.monsterId;
      commands.push(
        {
          commandId: `${prefix}.foe.${String(index)}.create`,
          command: {
            type: 'CreateEntity',
            entityId,
            kind: 'creature',
            name: (kinds.get(foe.monsterId) ?? 1) > 1 ? `${name} ${String(number)}` : name,
            existsSince: null,
            placement: { locationId: encounter.locationId, since: null },
          },
        },
        {
          commandId: `${prefix}.foe.${String(index)}.block`,
          command: {
            type: 'SetStatBlock',
            entityId,
            statBlock: srdMonsterBlock(foe.monsterId)?.statBlock,
          },
        },
      );
      return { entityId, position: foe.position };
    });
    // A side surprised as the fight starts rolls Initiative with Disadvantage (ADR 0045 §5).
    const surprised = (side: 'party' | 'foes') =>
      body.surprised === side ? { surprised: true as const } : {};
    commands.push({
      commandId: `${prefix}.start`,
      command: {
        type: 'StartCombat',
        locationId: encounter.locationId,
        battlefield: encounter.battlefield,
        combatants: [
          ...view.party.map((character, index) => ({
            entityId: character.entityId,
            side: 'party',
            position: encounter.partyStart[index] ?? encounter.partyStart[0],
            ...surprised('party'),
          })),
          ...combatants.map((foe) => ({ ...foe, side: 'hostile', ...surprised('foes') })),
        ],
      },
    });
    for (const { commandId, command } of commands) {
      if ((await deps.engine.load(path.campaignId))?.state.commands.has(commandId)) continue;
      const result = await deps.engine.execute({
        commandId,
        campaignId: path.campaignId,
        actor: dm.actor,
        command,
      });
      if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
    }
    request.log.info({ encounterId: path.encounterId }, 'saved encounter started');
    return reply.send(started);
  });
}
