import { randomUUID } from 'node:crypto';

import {
  campaignIdSchema,
  entityIdSchema,
  hitDieRequestSchema,
  levelUpRequestSchema,
  restEndRequestSchema,
  restRequestSchema,
  type RestResponse,
  type RestResult,
} from '@ltw/contracts';
import type { Actor, WorldState } from '@ltw/domain';
import { hitDieRefusal, levelUp, longRest, spendHitDie } from '@ltw/rules';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { TableDependencies } from '../dice/roll-access.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';

/**
 * Rests and milestone levels at the table (Stage 530, docs/PRODUCT_COMPLETION_PLAN.md decision 9).
 * The DM calls a long rest (hit points, spell slots, free casts and Hit Point Dice back; eight hours
 * pass) or opens a short one (an hour passes; players spend Hit Point Dice, rolled by the server,
 * until the DM ends it), and grants levels. The rules (`@ltw/rules`) compute every sheet and the
 * table's system actor records it through the World Engine, as sign-in records a seat (ADR 0036
 * §4): nothing the client sends becomes a number. Each request's commands carry its `requestId`, so
 * a retry after a lost answer is `duplicate`, never a second rest.
 */
export const TABLE_ACTOR: Actor = Object.freeze({ actorId: 'table', kind: 'system' });

const params = z.object({ campaignId: campaignIdSchema }).strict();
const characterParams = z
  .object({ campaignId: campaignIdSchema, characterId: entityIdSchema })
  .strict();
const query = z.object({ perspective: z.string() }).strict();
const HOUR = 3600;

const commandIdOf = (kind: 'rest' | 'hit-die' | 'level', requestId: string, part: string) =>
  `${kind}:${requestId}:${part}`;

/** The party's characters with a sheet: who rests. */
const restingCharacters = (state: WorldState) =>
  [...state.entities.values()].filter(
    (entity) =>
      entity.kind === 'character' &&
      entity.status === 'active' &&
      state.characterSheets.has(entity.entityId),
  );

const answer = (status: Exclude<RestResult['status'], 'healed'>): RestResult => ({ status });

export function registerRestRoutes(
  app: FastifyInstance,
  deps: RouteDependencies & { readonly table: TableDependencies },
): void {
  const { rests } = deps.table;

  /** Records one command the rules computed; false when the World Engine refuses it. */
  const record = async (campaignId: string, commandId: string, command: object) => {
    const result = await deps.engine.execute({
      campaignId,
      commandId,
      actor: TABLE_ACTOR,
      command,
    });
    return result.status !== 'rejected';
  };

  const dmOnly = async <P extends { campaignId: string }, B>(
    request: FastifyRequest,
    reply: FastifyReply,
    schemas: { readonly params: z.ZodType<P>; readonly body: z.ZodType<B> },
  ) => {
    const ready = await withBody(request, reply, deps, schemas);
    if (!ready) return null;
    if (ready.context.perspective.kind !== 'DM') {
      sendError(reply, request, 'FORBIDDEN');
      return null;
    }
    return ready;
  };

  app.get('/campaigns/:campaignId/rest', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    // A fight interrupts the rest: no Hit Point Die is spent while one runs.
    const open =
      ready.context.state.encounter === null ? await rests.openRest(ready.params.campaignId) : null;
    const body: RestResponse = {
      perspective: ready.context.perspective.label,
      rest: open ? { restId: open.restId, kind: open.kind, startedAt: open.startedAt } : null,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/rest', async (request, reply) => {
    const ready = await dmOnly(request, reply, { params, body: restRequestSchema });
    if (!ready) return reply;
    const { state } = ready.context;
    const { campaignId } = ready.params;
    const { requestId, kind } = ready.body;
    const time = commandIdOf('rest', requestId, 'time');
    if (state.commands.has(time)) return reply.send(answer('duplicate'));
    if (state.encounter !== null) return sendError(reply, request, 'CONFLICT');
    if (kind === 'long') {
      // A long rest closes a short one still open.
      const open = await rests.openRest(campaignId);
      if (open) await rests.endRest(campaignId, open.restId, deps.table.now());
      for (const character of restingCharacters(state)) {
        const id = commandIdOf('rest', requestId, character.entityId);
        const sheet = state.characterSheets.get(character.entityId);
        if (!sheet || state.commands.has(id)) continue;
        const command = { type: 'SetCharacterSheet', entityId: character.entityId };
        if (!(await record(campaignId, id, { ...command, sheet: longRest(sheet) }))) {
          return sendError(reply, request, 'CONFLICT');
        }
      }
      if (!(await record(campaignId, time, { type: 'AdvanceWorldTime', by: 8 * HOUR }))) {
        return sendError(reply, request, 'CONFLICT');
      }
      return reply.code(201).send(answer('rested'));
    }
    const started = await rests.startRest({
      restId: requestId,
      campaignId,
      kind: 'short',
      startedAt: deps.table.now(),
      endedAt: null,
    });
    // Another rest is open, unless it is this request's own from an attempt cut short.
    if (!started && (await rests.openRest(campaignId))?.restId !== requestId) {
      return sendError(reply, request, 'CONFLICT');
    }
    if (!(await record(campaignId, time, { type: 'AdvanceWorldTime', by: HOUR }))) {
      return sendError(reply, request, 'CONFLICT');
    }
    return reply.code(201).send(answer('resting'));
  });

  app.post('/campaigns/:campaignId/rest/end', async (request, reply) => {
    const ready = await dmOnly(request, reply, { params, body: restEndRequestSchema });
    if (!ready) return reply;
    const { campaignId } = ready.params;
    const open = await rests.openRest(campaignId);
    if (!open || !(await rests.endRest(campaignId, open.restId, deps.table.now()))) {
      return sendError(reply, request, 'CONFLICT');
    }
    return reply.send(answer('ended'));
  });

  app.post('/campaigns/:campaignId/rest/hit-die', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: hitDieRequestSchema });
    if (!ready) return reply;
    const { perspective, state } = ready.context;
    const { campaignId } = ready.params;
    const { requestId, characterId, sides } = ready.body;
    const own = perspective.kind === 'CHARACTER' && perspective.holderId === characterId;
    if (perspective.kind !== 'DM' && !own) return sendError(reply, request, 'FORBIDDEN');
    const id = commandIdOf('hit-die', requestId, characterId);
    if (state.commands.has(id)) return reply.send(answer('duplicate'));
    const sheet = state.characterSheets.get(characterId);
    if (!sheet || state.entities.get(characterId)?.kind !== 'character') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    if (state.encounter !== null || !(await rests.openRest(campaignId))) {
      return sendError(reply, request, 'CONFLICT');
    }
    // No die is rolled for a character who cannot spend one.
    if (hitDieRefusal(sheet, sides)) return sendError(reply, request, 'UNPROCESSABLE');
    // The face of the player's own die where the campaign's dice are theirs (ADR 0044 §4); the
    // DM's always. The rules heal from it as from the server's.
    const { face } = ready.body;
    if (face !== undefined) {
      const mayEnter =
        perspective.kind === 'DM' || (await deps.table.diceOf?.(campaignId)) === 'physical';
      if (!mayEnter) return sendError(reply, request, 'CONFLICT');
      if (face > sides) return sendError(reply, request, 'INVALID_REQUEST');
    }
    const roll = face ?? deps.table.dice.roll(sides);
    const spent = spendHitDie(sheet, sides, roll);
    if (typeof spent === 'string') return sendError(reply, request, 'UNPROCESSABLE');
    const command = { type: 'SetCharacterSheet', entityId: characterId, sheet: spent.sheet };
    if (!(await record(campaignId, id, command))) return sendError(reply, request, 'CONFLICT');
    await deps.table.store.addRoll({
      // The server's own ID: a request's ID is the client's and may name another roll.
      rollId: randomUUID(),
      campaignId,
      rollerId: characterId,
      subject: { kind: 'hit-die' },
      groups: [
        {
          purpose: 'hit-die',
          dice: [{ sides, value: roll }],
          modifier: spent.modifier,
          total: spent.healed,
        },
      ],
      hidden: false,
      entered: face !== undefined,
      audienceId: null,
      requestId: null,
      at: deps.table.now(),
    });
    const body: RestResult = { status: 'healed', healed: spent.healed };
    return reply.code(201).send(body);
  });

  app.post('/campaigns/:campaignId/characters/:characterId/level-up', async (request, reply) => {
    const ready = await dmOnly(request, reply, {
      params: characterParams,
      body: levelUpRequestSchema,
    });
    if (!ready) return reply;
    const { state } = ready.context;
    const { campaignId, characterId } = ready.params;
    const id = commandIdOf('level', ready.body.requestId, characterId);
    if (state.commands.has(id)) return reply.send(answer('duplicate'));
    const sheet = state.characterSheets.get(characterId);
    if (!sheet || state.entities.get(characterId)?.kind !== 'character') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const next = levelUp(sheet, ready.body.classId);
    if (typeof next === 'string') return sendError(reply, request, 'UNPROCESSABLE');
    const command = { type: 'SetCharacterSheet', entityId: characterId, sheet: next };
    if (!(await record(campaignId, id, command))) return sendError(reply, request, 'CONFLICT');
    return reply.code(201).send(answer('levelled'));
  });
}
