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
  type TableDice,
} from '@ltw/contracts';
import { knownEntityIds, partyMemberIds, type ResolvedPerspective } from '@ltw/domain';
import { d20Modes } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import {
  withBody,
  withPerspective,
  type PerspectiveContext,
  type RouteDependencies,
} from '../http/request-context.ts';
import {
  EnteredDice,
  EnteredFacesError,
  rollCheck,
  rollFreeDice,
  type DiceSource,
} from './table-rolls.ts';
import type { CheckRequestRecord, RestStore, TableRollRecord, TableStore } from './table-store.ts';
import { worldRolls, type WorldRoll } from './world-rolls.ts';

export interface TableDependencies {
  readonly store: TableStore;
  /** The DM's open short rests (Stage 530, `src/rest/`). */
  readonly rests: RestStore;
  readonly dice: DiceSource;
  readonly now: () => string;
  /** The campaign's dice (ADR 0044 §4, the table's state); none: the app's. */
  readonly diceOf?: (campaignId: string) => Promise<TableDice>;
}

/**
 * Whether this perspective may enter the faces of its own dice: the DM always (behind the
 * screen), a player where the campaign's dice are the players' own (docs/adr/0044-online-play.md
 * §4).
 */
async function mayEnter(
  table: TableDependencies,
  perspective: ResolvedPerspective,
  campaignId: string,
): Promise<boolean> {
  if (perspective.kind === 'DM') return true;
  return (await table.diceOf?.(campaignId)) === 'physical';
}

/** A roll from entered faces, or null when they do not fit its dice (too few, too many, off a die). */
function fromFaces<T>(faces: readonly number[], roll: (dice: DiceSource) => T): T | null {
  const entered = new EnteredDice(faces);
  try {
    const result = roll(entered);
    return entered.spent ? result : null;
  } catch (error) {
    if (error instanceof EnteredFacesError) return null;
    throw error;
  }
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const requestParams = z.object({ campaignId: campaignIdSchema, requestId: z.uuid() }).strict();
const rollParams = z.object({ campaignId: campaignIdSchema, rollId: z.uuid() }).strict();
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
    // A roll between the DM and one player is that player's only (ADR 0044 §4).
    table: (roll: TableRollRecord) =>
      dm ||
      (!roll.hidden &&
        (roll.audienceId === null
          ? roll.rollerId === null || sees(roll.rollerId)
          : roll.audienceId === own)),
  };
}

/** A roll as the client receives it: an explicit whitelist, nothing internal. */
const entryOf = (
  roll: {
    readonly rollId: string;
    readonly subject: RollEntry['subject'];
    readonly groups: RollEntry['groups'];
    readonly hidden: boolean;
    readonly entered?: boolean;
    readonly confirmed?: boolean;
    readonly audienceId?: string | null;
    readonly at: string;
  },
  roller: RollEntry['roller'],
): RollEntry => ({
  rollId: roll.rollId,
  roller,
  subject: roll.subject,
  groups: roll.groups,
  hidden: roll.hidden,
  ...(roll.entered === true ? { entered: true } : {}),
  ...(roll.entered === true && roll.confirmed === true ? { confirmed: true } : {}),
  ...(roll.audienceId !== undefined && roll.audienceId !== null ? { private: true } : {}),
  at: roll.at,
});

const tableEntry = (roll: TableRollRecord, roller: RollEntry['roller']): RollEntry =>
  entryOf({ ...roll, rollId: `table:${roll.rollId}` }, roller);

function requestView(record: CheckRequestRecord, dm: boolean): CheckRequestView {
  return {
    requestId: record.requestId,
    groupId: record.groupId,
    characterId: record.characterId,
    check: record.check,
    mode: record.mode,
    ...(dm && record.dc !== null ? { dc: record.dc } : {}),
    ...(record.private ? { private: true } : {}),
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
    // Faces off one's own dice (ADR 0044 §4): the DM's always, a player's where the campaign's
    // dice are the players' own; the server still computes every total from them.
    if (body.faces !== undefined && !(await mayEnter(deps.table, perspective, path.campaignId))) {
      return sendError(reply, request, 'CONFLICT');
    }
    if (body.kind === 'dice') {
      // A player rolls as its character, for the table or for the DM alone; the DM as the DM,
      // hidden at will or shown to one character.
      const player = perspective.kind === 'CHARACTER';
      if (
        (player && ((body.hidden ?? false) || body.shownTo !== undefined)) ||
        (!player && (body.private ?? false)) ||
        ((body.hidden ?? false) && body.shownTo !== undefined)
      ) {
        return sendError(reply, request, 'INVALID_REQUEST');
      }
      const rollerId = player ? perspective.holderId : null;
      if (body.characterId !== undefined && body.characterId !== rollerId) {
        return sendError(reply, request, 'FORBIDDEN');
      }
      if (body.shownTo !== undefined && state.entities.get(body.shownTo)?.kind !== 'character') {
        return sendError(reply, request, 'UNPROCESSABLE');
      }
      const roll = (dice: DiceSource) => rollFreeDice(dice, body.dice, body.modifier);
      const group = body.faces === undefined ? roll(deps.table.dice) : fromFaces(body.faces, roll);
      if (group === null) return sendError(reply, request, 'INVALID_REQUEST');
      const record: TableRollRecord = {
        rollId,
        campaignId: path.campaignId,
        rollerId,
        subject: { kind: 'dice' },
        groups: [group],
        hidden: !player && (body.hidden ?? false),
        entered: body.faces !== undefined,
        audienceId: player ? ((body.private ?? false) ? rollerId : null) : (body.shownTo ?? null),
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
    const roll = (dice: DiceSource) => rollCheck(dice, sheet, check, mode);
    const group = body.faces === undefined ? roll(deps.table.dice) : fromFaces(body.faces, roll);
    if (group === null) return sendError(reply, request, 'INVALID_REQUEST');
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
      entered: body.faces !== undefined,
      // A private request's answer, or a check rolled for the DM alone, is the two of theirs.
      audienceId: (asked?.private ?? false) || (body.private ?? false) ? body.characterId : null,
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
              (party?.has(record.characterId) === true && !record.private)),
        );
    // The viewer's character's d20 rolls under its conditions (ADR 0045 §1, §3).
    const sheet =
      perspective.kind === 'CHARACTER' && perspective.holderId !== null
        ? context.state.characterSheets.get(perspective.holderId)
        : undefined;
    const body: CheckRequestsResponse = {
      perspective: perspective.label,
      requests: requests.map((record) => requestView(record, dm)),
      ...(sheet ? { d20: d20Modes(sheet.conditions, sheet.exhaustion ?? 0) } : {}),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/check-requests', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: checkRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const { state } = context;
    // One character, or several at once as a group (ADR 0043 §1): every one a character with a sheet.
    const asked = 'characterIds' in body ? body.characterIds : [body.characterId];
    if (
      new Set(asked).size !== asked.length ||
      asked.some(
        (id) => !state.characterSheets.has(id) || state.entities.get(id)?.kind !== 'character',
      )
    ) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const groupId = 'characterIds' in body ? randomUUID() : null;
    const at = deps.table.now();
    const records = asked.map((characterId): CheckRequestRecord => ({
      requestId: randomUUID(),
      campaignId: path.campaignId,
      groupId,
      characterId,
      check: body.check,
      mode: body.mode,
      dc: body.dc ?? null,
      private: body.private ?? false,
      status: 'open',
      rollId: null,
      total: null,
      at,
    }));
    for (const record of records) await store.addRequest(record);
    const views = records.map((record) => requestView(record, true));
    return reply
      .code(201)
      .send(groupId === null ? { request: views[0] } : { groupId, requests: views });
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

  // The DM's word that a roll's entered faces are what the dice showed (ADR 0044 §4).
  app.post('/campaigns/:campaignId/rolls/:rollId/confirm', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params: rollParams,
      body: z.object({}).strict().optional(),
    });
    if (!ready) return reply;
    const { context, params: path } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const roll = await store.findRoll(path.campaignId, path.rollId);
    if (!roll) return sendError(reply, request, 'NOT_FOUND');
    if (!roll.entered) return sendError(reply, request, 'CONFLICT');
    await store.confirmRoll(path.campaignId, path.rollId, deps.table.now());
    return reply.code(200).send({ status: 'confirmed' });
  });
}
