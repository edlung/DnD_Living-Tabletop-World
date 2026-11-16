import {
  campaignIdSchema,
  pauseAnswerRequestSchema,
  pauseAskRequestSchema,
  type PauseAskView,
  type PauseAsksResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { LobbyDependencies } from '../table/table-state.ts';
import { PauseBoard } from './pause-board.ts';

/**
 * A player's quiet request for a pause over HTTP (docs/adr/0073-table-ideas.md §2), in the ADR
 * 0009 order. A player asks as their own character while a session plays; the DM reads every
 * request and says each is seen; a character's player reads their own and nobody else's. The
 * party's shared view, a table display and a stranger neither ask nor read: nobody else at the
 * table learns that someone asked. Nothing is stored: the board is this process's memory. The
 * live stream signals the DM and the asker because their inventories read this view
 * (`live/inventory.ts`); another player's read of it does not change.
 */
export interface PauseDependencies {
  readonly board: PauseBoard;
  /** The board's clock, in milliseconds. */
  readonly now: () => number;
}

/** A board of its own: every composition's default (there is no other store). */
export const memoryPauses = (): PauseDependencies => ({
  board: new PauseBoard(),
  now: () => Date.now(),
});

export interface PauseRouteDependencies extends RouteDependencies {
  readonly pauses: PauseDependencies;
  /** The table's state: a paused game has answered every request. */
  readonly lobby: LobbyDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();
/** The board takes one a minute from a character; this stops a script, not a thumb. */
const ASKS_PER_MINUTE = 12;

export function registerPauseRoutes(app: FastifyInstance, deps: PauseRouteDependencies): void {
  const { board, now } = deps.pauses;
  const limit = new WindowCounter({ limit: ASKS_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });

  app.get('/campaigns/:campaignId/pause-requests', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { state, perspective } = context;
    const dm = perspective.kind === 'DM';
    const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
    if (!dm && holder === null) return sendError(reply, request, 'FORBIDDEN');
    const at = now();
    // A session that ended leaves nothing to ask a pause of; a paused game has answered.
    if (state.activeSessionId === null) board.clear(path.campaignId);
    else if ((await deps.lobby.state.read(path.campaignId)).paused) {
      board.seenAll(path.campaignId, at);
    }
    const asks: PauseAskView[] = board
      .list(path.campaignId, at)
      .filter((ask) => dm || ask.characterId === holder)
      .map((ask) => ({
        character: {
          entityId: ask.characterId,
          name: state.entities.get(ask.characterId)?.name ?? null,
        },
        seen: ask.seenAt !== null,
      }));
    const body: PauseAsksResponse = { perspective: perspective.label, asks };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/pause-requests', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: pauseAskRequestSchema });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const holder = context.perspective.kind === 'CHARACTER' ? context.perspective.holderId : null;
    // A player asks as the character they play; the DM pauses, and nobody else asks.
    if (holder === null) return sendError(reply, request, 'FORBIDDEN');
    // Only of a game in play: between sessions, or paused already, there is nothing to ask.
    if (context.state.activeSessionId === null) return sendError(reply, request, 'UNPROCESSABLE');
    if ((await deps.lobby.state.read(path.campaignId)).paused) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    // Asked again within the minute, the request stands as it was: the answer is the same.
    board.ask(path.campaignId, holder, now());
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/pause-requests/answer', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: pauseAnswerRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    // Seen already, or gone meanwhile: the DM's word is taken all the same.
    board.seen(path.campaignId, body.characterId, now());
    return reply.code(204).send();
  });
}
