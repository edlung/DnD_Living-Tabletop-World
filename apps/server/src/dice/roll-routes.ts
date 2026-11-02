import { randomUUID } from 'node:crypto';

import {
  ROLL_FEED_SIZE,
  campaignIdSchema,
  checkRequestSchema,
  tableRollRequestSchema,
  type CheckRequestView,
  type CheckRequestsResponse,
  type RollEntry,
  type RollFeedResponse,
} from '@ltw/contracts';
import { knownEntityIds, partyMemberIds, type ResolvedPerspective } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import {
  withBody,
  withPerspective,
  type PerspectiveContext,
  type RouteDependencies,
} from '../http/request-context.ts';
import { rollCheck, rollFreeDice, type DiceSource } from './table-rolls.ts';
import type { CheckRequestRecord, RestStore, TableRollRecord, TableStore } from './table-store.ts';
import { worldRolls, type WorldRoll } from './world-rolls.ts';

export interface TableDependencies {
  readonly store: TableStore;
  /** The DM's open short rests (Stage 530, `src/rest/`). */
  readonly rests: RestStore;
  readonly dice: DiceSource;
  readonly now: () => string;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const requestParams = z.object({ campaignId: campaignIdSchema, requestId: z.uuid() }).strict();
const query = z.object({ perspective: z.string() }).strict();
/** How many of the DM's requests the DM's list keeps. */
const REQUEST_LIST = 20;

/** Who may see a roll, and under which name (never a hidden character's). */
function viewer(context: Omit<PerspectiveContext, 'history'>) {
  const { state, perspective } = context;
  const dm = perspective.kind === 'DM';
  const own = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  const known = dm ? null : knownEntityIds(state, perspective);
  const sees = (id: string) => dm || id === own || (known?.has(id) ?? false);
  return {
    dm,
    own,
    roller: (id: string | null): RollEntry['roller'] =>
      id === null
        ? null
        : { entityId: id, name: sees(id) ? (state.entities.get(id)?.name ?? null) : null },
    world: (roll: WorldRoll) =>
      dm || (!roll.dmOnly && roll.rollerId !== null && roll.rollerId === own),
    table: (roll: TableRollRecord) =>
      dm || (!roll.hidden && (roll.rollerId === null || sees(roll.rollerId))),
  };
}

/** A roll as the client receives it: an explicit whitelist, nothing internal. */
const entryOf = (
  roll: {
    readonly rollId: string;
    readonly subject: RollEntry['subject'];
    readonly groups: RollEntry['groups'];
    readonly hidden: boolean;
    readonly at: string;
  },
  roller: RollEntry['roller'],
): RollEntry => ({
  rollId: roll.rollId,
  roller,
  subject: roll.subject,
  groups: roll.groups,
  hidden: roll.hidden,
  at: roll.at,
});

const tableEntry = (roll: TableRollRecord, roller: RollEntry['roller']): RollEntry =>
  entryOf({ ...roll, rollId: `table:${roll.rollId}` }, roller);

function requestView(record: CheckRequestRecord, dm: boolean): CheckRequestView {
  return {
    requestId: record.requestId,
    characterId: record.characterId,
    check: record.check,
    mode: record.mode,
    ...(dm && record.dc !== null ? { dc: record.dc } : {}),
    status: record.status,
    ...(record.total !== null ? { total: record.total } : {}),
    ...(dm && record.dc !== null && record.total !== null
      ? { success: record.total >= record.dc }
      : {}),
    at: record.at,
  };
}

/** Whether this perspective may roll for that character: its own, or any for the DM. */
const rollsFor = (perspective: ResolvedPerspective, characterId: string) =>
  perspective.kind === 'DM' ||
  (perspective.kind === 'CHARACTER' && perspective.holderId === characterId);

/**
 * Dice at the table (Stage 510): the roll feed, free rolls and checks rolled by the server, and the
 * DM's check requests. Rolls live beside the world (migration 0025), never in its history.
 */
export function registerRollRoutes(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly table: TableDependencies },
): void {
  const { store } = deps.table;

  app.get('/campaigns/:campaignId/rolls', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const sees = viewer(context);
    const world = worldRolls(context.history, context.state)
      .filter(sees.world)
      .map((roll) => entryOf(roll, sees.roller(roll.rollerId)));
    const table = (await store.recentRolls(path.campaignId, ROLL_FEED_SIZE))
      .filter(sees.table)
      .map((roll) => tableEntry(roll, sees.roller(roll.rollerId)));
    const rolls = [...world, ...table]
      .sort((a, b) => a.at.localeCompare(b.at) || a.rollId.localeCompare(b.rollId))
      .slice(-ROLL_FEED_SIZE);
    const body: RollFeedResponse = { perspective: context.perspective.label, rolls };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/rolls', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: tableRollRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    if (perspective.kind !== 'DM' && perspective.kind !== 'CHARACTER') {
      return sendError(reply, request, 'FORBIDDEN');
    }
    const at = deps.table.now();
    const rollId = randomUUID();
    if (body.kind === 'dice') {
      // A player rolls as its character and never hidden; the DM as the DM, hidden at will.
      if (perspective.kind === 'CHARACTER' && (body.hidden ?? false)) {
        return sendError(reply, request, 'INVALID_REQUEST');
      }
      const rollerId = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
      if (body.characterId !== undefined && body.characterId !== rollerId) {
        return sendError(reply, request, 'FORBIDDEN');
      }
      const record: TableRollRecord = {
        rollId,
        campaignId: path.campaignId,
        rollerId,
        subject: { kind: 'dice' },
        groups: [rollFreeDice(deps.table.dice, body.dice, body.modifier)],
        hidden: perspective.kind === 'DM' && (body.hidden ?? false),
        requestId: null,
        at,
      };
      await store.addRoll(record);
      return reply.code(201).send({ roll: tableEntry(record, viewer(context).roller(rollerId)) });
    }
    if (!rollsFor(perspective, body.characterId)) return sendError(reply, request, 'FORBIDDEN');
    const sheet = state.characterSheets.get(body.characterId);
    if (!sheet || state.entities.get(body.characterId)?.kind !== 'character') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const asked =
      body.requestId === undefined
        ? null
        : await store.findRequest(path.campaignId, body.requestId);
    if (
      body.requestId !== undefined &&
      (asked?.characterId !== body.characterId || asked.status !== 'open')
    ) {
      return sendError(reply, request, 'CONFLICT');
    }
    const check = asked?.check ?? body.check;
    const mode = asked?.mode ?? body.mode;
    const group = rollCheck(deps.table.dice, sheet, check, mode);
    const record: TableRollRecord = {
      rollId,
      campaignId: path.campaignId,
      rollerId: body.characterId,
      subject:
        check.kind === 'skill'
          ? { kind: 'skill', skill: check.skill }
          : { kind: check.kind, ability: check.ability },
      groups: [group],
      hidden: false,
      requestId: asked?.requestId ?? null,
      at,
    };
    if (asked) {
      const answered = await store.answerRequest(record, group.total);
      if (!answered) return sendError(reply, request, 'CONFLICT');
    } else {
      await store.addRoll(record);
    }
    return reply
      .code(201)
      .send({ roll: tableEntry(record, viewer(context).roller(body.characterId)) });
  });

  app.get('/campaigns/:campaignId/check-requests', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { perspective } = context;
    const dm = perspective.kind === 'DM';
    const recent = await store.recentRequests(path.campaignId, REQUEST_LIST);
    // The party (the table's display, ADR 0042) sees whom the DM is waiting on, never a DC.
    const party = perspective.kind === 'PARTY' ? partyMemberIds(context.state) : null;
    const requests = dm
      ? recent
      : recent.filter(
          (record) =>
            record.status === 'open' &&
            ((perspective.kind === 'CHARACTER' && record.characterId === perspective.holderId) ||
              party?.has(record.characterId) === true),
        );
    const body: CheckRequestsResponse = {
      perspective: perspective.label,
      requests: requests.map((record) => requestView(record, dm)),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/check-requests', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: checkRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const { state } = context;
    if (
      !state.characterSheets.has(body.characterId) ||
      state.entities.get(body.characterId)?.kind !== 'character'
    ) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const record: CheckRequestRecord = {
      requestId: randomUUID(),
      campaignId: path.campaignId,
      characterId: body.characterId,
      check: body.check,
      mode: body.mode,
      dc: body.dc ?? null,
      status: 'open',
      rollId: null,
      total: null,
      at: deps.table.now(),
    };
    await store.addRequest(record);
    return reply.code(201).send({ request: requestView(record, true) });
  });

  app.post('/campaigns/:campaignId/check-requests/:requestId/cancel', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params: requestParams,
      body: z.object({}).strict().optional(),
    });
    if (!ready) return reply;
    const { context, params: path } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const cancelled = await store.cancelRequest(path.campaignId, path.requestId);
    if (!cancelled) return sendError(reply, request, 'CONFLICT');
    return reply.code(200).send({ status: 'cancelled' });
  });
}
