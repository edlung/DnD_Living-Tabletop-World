import {
  campaignIdSchema,
  endingRequestSchema,
  keepsakeRequestSchema,
  parsePerspective,
  type EndingResponse,
  type KeepsakeRequest,
  type KeepsakeView,
} from '@ltw/contracts';
import {
  inventoryView,
  knownEntityIds,
  resolvePerspective,
  type Actor,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { EndingStore, KeepsakeRecord } from './ending-store.ts';

/**
 * A campaign's end and its heroes' keepsakes over HTTP (docs/adr/0072-keepsakes.md §2), in the ADR
 * 0009 order. The DM finishes a campaign between sessions and may reopen it; every member and a
 * table display read the end and the keepsakes — table data the whole table reads, like a star. A
 * player chooses for their own character, the DM for anyone at the table, once the campaign is
 * finished: one thing the hero carries, named as that hero knows it, or one chapter of the
 * party's story.
 */
export interface EndingDependencies {
  readonly store: EndingStore;
  readonly now: () => string;
}

export interface EndingRouteDependencies extends RouteDependencies {
  readonly ending: EndingDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();
const WRITES_PER_MINUTE = 20;
const PARTY = 'PARTY';

/** The hero's own view: the DM may take it for anyone, a player only for their own characters. */
function heroView(
  state: WorldState,
  actor: Actor,
  characterId: string,
): ResolvedPerspective | null {
  if (state.entities.get(characterId)?.kind !== 'character') return null;
  const wanted = parsePerspective(`CHARACTER:${characterId}`);
  const access = wanted ? resolvePerspective(state, actor, wanted) : null;
  return access?.ok === true ? access.perspective : null;
}

/** The keepsake's name as the hero knows it; null when it is not theirs to keep. */
function labelOf(
  state: WorldState,
  hero: ResolvedPerspective,
  characterId: string,
  keep: NonNullable<KeepsakeRequest['keep']>,
): string | null {
  if (keep.kind === 'chapter') {
    const chapter = state.chronicles.get(keep.refId);
    return chapter?.perspective === PARTY ? chapter.title : null;
  }
  const carried = inventoryView(state, hero, characterId)?.items ?? [];
  return carried.find((item) => item.itemId === keep.refId)?.name ?? null;
}

export function registerEndingRoutes(app: FastifyInstance, deps: EndingRouteDependencies): void {
  const { store, now } = deps.ending;
  const limit = new WindowCounter({ limit: WRITES_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });
  const limited = (campaignId: string, actorId: string) =>
    limit.take(`${campaignId}\n${actorId}`, Date.now()) === 'limited';

  app.get('/campaigns/:campaignId/ending', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { state, perspective } = context;
    const known = knownEntityIds(state, perspective);
    const dm = perspective.kind === 'DM';
    const mine = (characterId: string) =>
      dm || (perspective.kind === 'CHARACTER' && perspective.holderId === characterId);
    const end = await store.read(path.campaignId);
    const keepsakes: KeepsakeView[] = (await store.keepsakes(path.campaignId)).map((kept) => ({
      hero: {
        entityId: kept.characterId,
        name: known.has(kept.characterId)
          ? (state.entities.get(kept.characterId)?.name ?? null)
          : null,
      },
      kind: kept.kind,
      refId: kept.refId,
      label: kept.label,
      line: kept.line,
      own: mine(kept.characterId),
    }));
    const body: EndingResponse = {
      perspective: perspective.label,
      ending: end === null ? null : { finishedAt: end.finishedAt, line: end.line },
      keepsakes,
      heroes: [...state.entities.values()]
        .filter((entity) => entity.kind === 'character' && mine(entity.entityId))
        .map((entity) => ({ entityId: entity.entityId, name: entity.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/ending', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: endingRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    if (limited(path.campaignId, context.actor.actorId)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    if (!body.finished) {
      await store.reopen(path.campaignId);
      return reply.code(204).send();
    }
    // An evening still open is closed first: its chapter and its stars come before the end.
    if (context.state.activeSessionId !== null) return sendError(reply, request, 'UNPROCESSABLE');
    const before = await store.read(path.campaignId);
    await store.finish({
      campaignId: path.campaignId,
      // The words may change; the day it ended stays.
      finishedAt: before?.finishedAt ?? now(),
      line: body.line ?? before?.line ?? '',
    });
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/keepsakes', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: keepsakeRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { state, actor, perspective } = context;
    // A player's own view or the DM's: the party's view and a table display choose for nobody.
    if (perspective.kind !== 'DM' && perspective.kind !== 'CHARACTER') {
      return sendError(reply, request, 'FORBIDDEN');
    }
    const hero = heroView(state, actor, body.characterId);
    if (hero === null) return sendError(reply, request, 'FORBIDDEN');
    // Keepsakes are chosen when the adventure is over.
    if ((await store.read(path.campaignId)) === null) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    if (limited(path.campaignId, actor.actorId)) return sendError(reply, request, 'RATE_LIMITED');
    if (body.keep === null) {
      await store.drop(path.campaignId, body.characterId);
      return reply.code(204).send();
    }
    const label = labelOf(state, hero, body.characterId, body.keep);
    if (label === null) return sendError(reply, request, 'UNPROCESSABLE');
    const record: KeepsakeRecord = {
      campaignId: path.campaignId,
      characterId: body.characterId,
      kind: body.keep.kind,
      refId: body.keep.refId,
      label,
      line: body.keep.line,
      keptAt: now(),
    };
    await store.keep(record);
    return reply.code(204).send();
  });
}
