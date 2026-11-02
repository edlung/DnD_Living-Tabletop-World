import { randomUUID } from 'node:crypto';

import {
  ROLL_FEED_SIZE,
  tableRerollRequestSchema,
  type CharacterSheet,
  type Check,
  type RollMode,
  type RollSubject,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';

import { sendError } from '../http/errors.ts';
import { withBody, type RouteDependencies } from '../http/request-context.ts';
import {
  fromFaces,
  mayEnter,
  rollParams,
  rollsFor,
  tableEntry,
  viewer,
  type TableDependencies,
} from './roll-access.ts';
import { rerollCheck, type DiceSource } from './table-rolls.ts';
import type { TableRollRecord } from './table-store.ts';
import { worldRolls, type WorldRoll } from './world-rolls.ts';

/**
 * Heroic Inspiration on the table's checks (docs/adr/0046-reactions-beyond-counterspell.md §6): a
 * player spends the character's inspiration to roll its latest check's lower d20 again; the new
 * roll counts — a request it answered takes the new total — and the first stays in the log marked
 * rolled again.
 */
export interface Reroll {
  readonly roll: TableRollRecord;
  readonly check: Check;
  /** The mode the check was rolled in, its conditions counted. */
  readonly mode: RollMode;
}

/** The check a table roll was for, or null for free dice. */
function checkOf(subject: RollSubject): Check | null {
  switch (subject.kind) {
    case 'skill':
      return { kind: 'skill', skill: subject.skill };
    case 'ability':
    case 'save':
      return { kind: subject.kind, ability: subject.ability };
    default:
      return null;
  }
}

/**
 * The check a character may roll again, or null: its own latest roll — no table or World Engine
 * roll of its since — a check, not failed outright, while the character holds Heroic Inspiration.
 * A roll with Advantage or Disadvantage from before migration 0033 has no known mode and is not.
 */
export function rerollable(
  table: readonly TableRollRecord[],
  world: readonly WorldRoll[],
  characterId: string,
  sheet: CharacterSheet | undefined,
): Reroll | null {
  if (sheet?.heroicInspiration !== true) return null;
  const roll = table.findLast((one) => one.rollerId === characterId);
  const group = roll?.groups[0];
  if (!roll || !group || roll.groups.length !== 1 || group.autoFail === true) return null;
  const check = checkOf(roll.subject);
  const mode = roll.mode ?? (group.dice.length === 1 ? 'normal' : null);
  const since = world.some((one) => one.rollerId === characterId && one.at > roll.at);
  if (check === null || mode === null || since) return null;
  return group.dice.length === (mode === 'normal' ? 1 : 2) ? { roll, check, mode } : null;
}

/**
 * POST …/rolls/:rollId/reroll. The inspiration is spent through the World Engine under the roll's
 * own command ID, so a second press spends nothing more; the store writes one reroll per roll.
 */
export function registerRerollRoute(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly table: TableDependencies },
): void {
  const { store } = deps.table;
  app.post('/campaigns/:campaignId/rolls/:rollId/reroll', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params: rollParams,
      body: tableRerollRequestSchema,
    });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    const roll = await store.findRoll(path.campaignId, path.rollId);
    const rollerId = roll?.rollerId ?? null;
    if (!roll || rollerId === null || !viewer(context).table(roll)) {
      return sendError(reply, request, 'NOT_FOUND');
    }
    if (!rollsFor(perspective, rollerId)) return sendError(reply, request, 'FORBIDDEN');
    if (body.faces !== undefined && !(await mayEnter(deps.table, perspective, path.campaignId))) {
      return sendError(reply, request, 'CONFLICT');
    }
    const history = (await deps.engine.load(path.campaignId))?.history ?? [];
    const target = rerollable(
      await store.recentRolls(path.campaignId, ROLL_FEED_SIZE),
      worldRolls(history, state),
      rollerId,
      state.characterSheets.get(rollerId),
    );
    const first = roll.groups[0];
    if (target?.roll.rollId !== roll.rollId || !first) {
      return sendError(reply, request, 'CONFLICT');
    }
    const again = (dice: DiceSource) => rerollCheck(dice, first, target.mode);
    const group = body.faces === undefined ? again(deps.table.dice) : fromFaces(body.faces, again);
    if (!group) return sendError(reply, request, 'INVALID_REQUEST');
    const spent = await deps.engine.execute({
      commandId: `reroll.${roll.rollId}`,
      campaignId: path.campaignId,
      actor: context.actor,
      command: { type: 'SpendInspiration', characterId: rollerId },
    });
    if (spent.status === 'rejected') return sendError(reply, request, 'CONFLICT');
    const record: TableRollRecord = {
      rollId: randomUUID(),
      campaignId: roll.campaignId,
      rollerId,
      subject: roll.subject,
      groups: [group],
      hidden: roll.hidden,
      entered: body.faces !== undefined,
      audienceId: roll.audienceId,
      requestId: roll.requestId,
      at: deps.table.now(),
      rerollOf: roll.rollId,
      mode: target.mode,
    };
    if (!(await store.addReroll(record, group.total))) {
      return sendError(reply, request, 'CONFLICT');
    }
    return reply.code(201).send({ roll: tableEntry(record, viewer(context).roller(rollerId)) });
  });
}
