import {
  campaignIdSchema,
  cheerRequestSchema,
  type CheerView,
  type CheersResponse,
} from '@ltw/contracts';
import { knownEntityIds } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import { CheerBoard } from './cheer-board.ts';

/**
 * Cheers at the table over HTTP (docs/adr/0072-keepsakes.md §3), in the ADR 0009 order. Every
 * member and a table display read the cheers still held; a player gives one as their own
 * character, the DM as the DM; a table display, the party's shared view and a stranger give
 * none. Names are the reader's own (a character the reader does not know is unnamed). Nothing is
 * stored: the board is this process's memory. The live stream signals a cheer because each
 * screen's inventory reads this view (`live/inventory.ts`).
 */
export interface CheerDependencies {
  readonly board: CheerBoard;
  /** The board's clock, in milliseconds. */
  readonly now: () => number;
}

/** A board of its own: every composition's default (there is no other store). */
export const memoryCheers = (): CheerDependencies => ({
  board: new CheerBoard(),
  now: () => Date.now(),
});

export interface CheerRouteDependencies extends RouteDependencies {
  readonly cheers: CheerDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();
/** A child's thumb on the button: one a second is plenty, and the board holds twelve. */
const CHEERS_PER_MINUTE = 30;

export function registerCheerRoutes(app: FastifyInstance, deps: CheerRouteDependencies): void {
  const { board, now } = deps.cheers;
  const limit = new WindowCounter({ limit: CHEERS_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });

  app.get('/campaigns/:campaignId/cheers', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { state, perspective } = ready.context;
    const known = knownEntityIds(state, perspective);
    const cheers: CheerView[] = board.list(ready.params.campaignId, now()).map((cheer) => ({
      cheerId: cheer.cheerId,
      mark: cheer.mark,
      by:
        cheer.characterId === null
          ? null
          : {
              entityId: cheer.characterId,
              name: known.has(cheer.characterId)
                ? (state.entities.get(cheer.characterId)?.name ?? null)
                : null,
            },
    }));
    const body: CheersResponse = { perspective: perspective.label, cheers };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/cheers', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: cheerRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const dm = context.perspective.kind === 'DM';
    const holder = context.perspective.kind === 'CHARACTER' ? context.perspective.holderId : null;
    // A player cheers as the character they play, the DM as the DM; nobody else does.
    if (!dm && holder === null) return sendError(reply, request, 'FORBIDDEN');
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    // A retried request is the cheer it was: the board takes an ID once.
    board.add(path.campaignId, {
      cheerId: body.cheerId,
      mark: body.mark,
      characterId: dm ? null : holder,
      at: now(),
    });
    return reply.code(204).send();
  });
}
