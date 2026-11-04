import {
  PING_MS,
  campaignIdSchema,
  markRequestSchema,
  markSettingsSchema,
  type MarkView,
  type MarksResponse,
} from '@ltw/contracts';
import type { RecordedEvent, WorldState } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { MarkRecord, MarkStore } from './mark-store.ts';

/**
 * The table's shared marks over HTTP (docs/adr/0057-encounters-maps-loot.md §5), in the ADR 0009
 * order. Every member and the table's display reads them; the DM always marks, a player as their
 * character when the DM allows; the DM's pointer is the DM's; a mark is removed by its author or the
 * DM, and the DM clears them all. Marks belong to the run of the fight they were laid on, and there
 * is none outside a fight. The live stream signals a change because each screen's inventory reads
 * this view (`live/inventory.ts`).
 */
export interface MarkDependencies {
  readonly store: MarkStore;
  readonly now: () => string;
}

export interface MarkRouteDependencies extends RouteDependencies {
  readonly marks: MarkDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const markParams = z.object({ campaignId: campaignIdSchema, markId: z.uuid() }).strict();
const query = z.object({ perspective: z.string() }).strict();
const empty = z.object({}).strict();
const MARKS_PER_MINUTE = 60;

/**
 * The run of the fight under way: its start's event ID, so a fight started again — the same saved
 * encounter, or after an undo — begins with no marks. Null outside a fight.
 */
export function fightOf(state: WorldState, history: readonly RecordedEvent[]): string | null {
  if (state.encounter === null) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (event?.type === 'CombatStarted') return event.eventId;
  }
  return null;
}

const viewOf = (record: MarkRecord): MarkView => ({
  markId: record.markId,
  kind: record.kind,
  by: record.byDm ? 'dm' : 'player',
  ...(record.square ? { square: record.square } : {}),
  ...(record.squares ? { squares: record.squares } : {}),
  createdAt: record.createdAt,
});

export function registerMarkRoutes(app: FastifyInstance, deps: MarkRouteDependencies): void {
  const { store, now } = deps.marks;
  const limit = new WindowCounter({ limit: MARKS_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });
  // The fight under way and its field, as a mark is laid or removed.
  const fightNow = async (campaignId: string) => {
    const snapshot = await deps.engine.load(campaignId);
    const encounter = snapshot?.state.encounter ?? null;
    const fightId = snapshot && encounter ? fightOf(snapshot.state, snapshot.history) : null;
    return encounter && fightId !== null ? { fightId, field: encounter.battlefield } : null;
  };

  app.get('/campaigns/:campaignId/marks', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { campaignId } = ready.params;
    const fight = fightOf(ready.context.state, ready.context.history);
    const body: MarksResponse = {
      perspective: ready.context.perspective.label,
      marks: fight === null ? [] : (await store.list(campaignId, fight, now())).map(viewOf),
      playersMayMark: await store.playersMayMark(campaignId),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/marks', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: markRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const dm = context.perspective.kind === 'DM';
    // A player marks as their character, and only when the DM allows; the pointer is the DM's.
    if (!dm) {
      if (context.perspective.kind !== 'CHARACTER' || body.kind === 'pointer')
        return sendError(reply, request, 'FORBIDDEN');
      if (!(await store.playersMayMark(path.campaignId)))
        return sendError(reply, request, 'FORBIDDEN');
    }
    // A mark is laid on a fight's board, within its field.
    const fight = await fightNow(path.campaignId);
    if (fight === null) return sendError(reply, request, 'CONFLICT');
    const squares = 'square' in body ? [body.square] : body.squares;
    if (squares.some((one) => one.x >= fight.field.width || one.y >= fight.field.height))
      return sendError(reply, request, 'INVALID_REQUEST');
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited')
      return sendError(reply, request, 'RATE_LIMITED');
    const at = now();
    const record: MarkRecord = {
      campaignId: path.campaignId,
      fightId: fight.fightId,
      markId: body.markId,
      authorId: context.actor.actorId,
      byDm: dm,
      kind: body.kind,
      ...('square' in body ? { square: body.square } : {}),
      ...('squares' in body ? { squares: body.squares } : {}),
      createdAt: at,
      expiresAt: body.kind === 'ping' ? new Date(Date.parse(at) + PING_MS).toISOString() : null,
    };
    const added = await store.add(record);
    return reply.code(added ? 201 : 200).send({ mark: viewOf(record) });
  });

  app.post('/campaigns/:campaignId/marks/:markId/delete', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params: markParams, body: empty });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const fight = await fightNow(path.campaignId);
    const found =
      fight === null
        ? undefined
        : (await store.list(path.campaignId, fight.fightId, now())).find(
            (mark) => mark.markId === path.markId,
          );
    if (!found) return sendError(reply, request, 'NOT_FOUND');
    if (context.perspective.kind !== 'DM' && found.authorId !== context.actor.actorId)
      return sendError(reply, request, 'FORBIDDEN');
    await store.remove(path.campaignId, path.markId);
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/marks/clear', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: empty });
    if (!ready) return reply;
    if (ready.context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    await store.clear(ready.params.campaignId);
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/marks/settings', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: markSettingsSchema });
    if (!ready) return reply;
    if (ready.context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    await store.setPlayersMayMark(ready.params.campaignId, ready.body.playersMayMark);
    return reply.send({ playersMayMark: ready.body.playersMayMark });
  });
}
