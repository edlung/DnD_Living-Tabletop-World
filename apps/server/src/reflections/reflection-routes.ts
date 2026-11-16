import {
  REFLECTION_BOOK_SESSIONS,
  REFLECTION_SESSIONS,
  campaignIdSchema,
  reflectionRequestSchema,
  type ReflectionView,
  type ReflectionsResponse,
  type SessionReflections,
} from '@ltw/contracts';
import { knownEntityIds, type ResolvedPerspective, type WorldState } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { ReflectionRecord, ReflectionStore } from './reflection-store.ts';

/**
 * Stars and wishes over HTTP (docs/adr/0071-memory-and-ritual.md §2), in the ADR 0009 order.
 * Everyone at the table — a table display too — reads the stars; a wish is read by its author, in
 * that character's perspective, and by the DM. A player writes for their own character, the DM for
 * anyone at the table and for themself, between sessions, for the session that ended last. Names
 * are the reader's own (an author the reader does not know is unnamed).
 */
export interface ReflectionDependencies {
  readonly store: ReflectionStore;
  readonly now: () => string;
}

export interface ReflectionRouteDependencies extends RouteDependencies {
  readonly reflections: ReflectionDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
// `book`: every ended evening the campaign's book prints (ADR 0072 §1), not the latest few.
const query = z.object({ perspective: z.string(), book: z.literal('true').optional() }).strict();
const WRITES_PER_MINUTE = 20;

/** The session stars and wishes may be written for: it ended last and none has started since. */
export function openSessionOf(state: WorldState): string | null {
  if (state.activeSessionId !== null) return null;
  const last = [...state.sessions.values()].at(-1);
  return last && last.endedAt !== null ? last.sessionId : null;
}

/** The entry as this perspective reads it; null when it shows nothing of it. */
function viewOf(
  state: WorldState,
  perspective: ResolvedPerspective,
  known: ReadonlySet<string>,
  record: ReflectionRecord,
): ReflectionView | null {
  const dm = perspective.kind === 'DM';
  const mine =
    perspective.kind === 'CHARACTER' &&
    record.authorId !== null &&
    record.authorId === perspective.holderId;
  // A wish alone is nothing to anyone but its author and the DM.
  if (!dm && !mine && record.star === '') return null;
  return {
    author:
      record.authorId === null
        ? null
        : {
            entityId: record.authorId,
            name: known.has(record.authorId)
              ? (state.entities.get(record.authorId)?.name ?? null)
              : null,
          },
    star: record.star,
    wish: dm || mine ? record.wish : null,
    own: dm || mine,
  };
}

export function registerReflectionRoutes(
  app: FastifyInstance,
  deps: ReflectionRouteDependencies,
): void {
  const { store, now } = deps.reflections;
  const limit = new WindowCounter({ limit: WRITES_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });

  app.get('/campaigns/:campaignId/reflections', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path, query: asked } = ready;
    const { state, perspective } = context;
    const known = knownEntityIds(state, perspective);
    const open = openSessionOf(state);
    const entries = await store.ofCampaign(path.campaignId);
    const sessions: SessionReflections[] = [...state.sessions.values()]
      .filter((session) => session.endedAt !== null)
      .slice(-(asked.book === 'true' ? REFLECTION_BOOK_SESSIONS : REFLECTION_SESSIONS))
      .reverse()
      .map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        open: session.sessionId === open,
        entries: entries
          .filter((entry) => entry.sessionId === session.sessionId)
          .map((entry) => viewOf(state, perspective, known, entry))
          .filter((entry): entry is ReflectionView => entry !== null),
      }));
    const body: ReflectionsResponse = { perspective: perspective.label, sessions };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/reflections', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: reflectionRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    const dm = perspective.kind === 'DM';
    const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
    // A player writes their own character's words; the DM anyone's at the table, and their own.
    // Nobody else writes: a table display, the party's shared view, a stranger.
    if (!dm && (holder === null || body.characterId !== holder)) {
      return sendError(reply, request, 'FORBIDDEN');
    }
    if (body.characterId !== null && state.entities.get(body.characterId)?.kind !== 'character') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    // Only for the session that ended last, until the next one starts.
    if (body.sessionId !== openSessionOf(state)) return sendError(reply, request, 'UNPROCESSABLE');
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    if (body.star === '' && body.wish === '') {
      await store.remove(path.campaignId, body.sessionId, body.characterId);
    } else {
      await store.put({
        campaignId: path.campaignId,
        sessionId: body.sessionId,
        authorId: body.characterId,
        star: body.star,
        wish: body.wish,
        updatedAt: now(),
      });
    }
    return reply.code(204).send();
  });
}
