import { randomUUID } from 'node:crypto';

import {
  HANDOUT_PAGE,
  campaignIdSchema,
  handoutRequestSchema,
  type HandoutView,
  type HandoutsResponse,
} from '@ltw/contracts';
import {
  knownEntityIds,
  resolvePerspective,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { HandoutRecord, HandoutStore } from './handout-store.ts';

/**
 * Handouts over HTTP (docs/adr/0044-online-play.md §5), in the ADR 0009 order. The DM gives them;
 * the DM reads every one, a character's perspective the party's and its own, the party's view (the
 * table's screen too) the party's; nobody else reads any. A picture is of something the recipient
 * knows when it is given, and shows only while the reader knows it; names are the reader's own.
 * Table material, never world knowledge: what a handout teaches, the DM records as knowledge.
 */
export interface HandoutDependencies {
  readonly store: HandoutStore;
  readonly now: () => string;
}

export interface HandoutRouteDependencies extends RouteDependencies {
  readonly handouts: HandoutDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

/** Whether this perspective reads the handout. */
function reads(perspective: ResolvedPerspective, record: HandoutRecord): boolean {
  if (perspective.kind === 'DM') return true;
  if (record.recipientId === null)
    return perspective.kind === 'PARTY' || perspective.kind === 'CHARACTER';
  return perspective.kind === 'CHARACTER' && perspective.holderId === record.recipientId;
}

function viewOf(state: WorldState, known: ReadonlySet<string>, record: HandoutRecord): HandoutView {
  const ref = (id: string) => ({
    entityId: id,
    name: known.has(id) ? (state.entities.get(id)?.name ?? null) : null,
  });
  return {
    handoutId: record.handoutId,
    title: record.title,
    text: record.text,
    picture: record.entityId !== null && known.has(record.entityId) ? ref(record.entityId) : null,
    to: record.recipientId === null ? 'party' : ref(record.recipientId),
    at: record.at,
  };
}

export function registerHandoutRoutes(app: FastifyInstance, deps: HandoutRouteDependencies): void {
  const { store, now } = deps.handouts;

  app.get('/campaigns/:campaignId/handouts', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const known = knownEntityIds(context.state, context.perspective);
    const body: HandoutsResponse = {
      perspective: context.perspective.label,
      handouts: (await store.recent(path.campaignId, HANDOUT_PAGE * 4))
        .filter((record) => reads(context.perspective, record))
        .slice(-HANDOUT_PAGE)
        .map((record) => viewOf(context.state, known, record)),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/handouts', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: handoutRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { state, actor } = context;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    if (
      body.recipientId !== undefined &&
      state.entities.get(body.recipientId)?.kind !== 'character'
    ) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    // A picture of something its recipient knows: the party's view, or the one character's.
    if (body.entityId !== undefined) {
      const audience = resolvePerspective(
        state,
        actor,
        body.recipientId === undefined
          ? { kind: 'PARTY' }
          : { kind: 'CHARACTER', characterId: body.recipientId },
      );
      if (!audience.ok || !knownEntityIds(state, audience.perspective).has(body.entityId)) {
        return sendError(reply, request, 'UNPROCESSABLE');
      }
    }
    const record: HandoutRecord = {
      campaignId: path.campaignId,
      handoutId: randomUUID(),
      recipientId: body.recipientId ?? null,
      title: body.title,
      text: body.text ?? null,
      entityId: body.entityId ?? null,
      at: now(),
    };
    await store.add(record);
    const known = knownEntityIds(state, context.perspective);
    return reply.code(201).send({ handout: viewOf(state, known, record) });
  });
}
