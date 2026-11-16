import { randomUUID } from 'node:crypto';

import {
  MAX_ENVELOPES,
  campaignIdSchema,
  envelopeParamsSchema,
  sealEnvelopeSchema,
  type DmEnvelopeView,
  type DmEnvelopesResponse,
  type EnvelopeOpens,
  type EnvelopesResponse,
} from '@ltw/contracts';
import { campaignRole, type Actor, type WorldState } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { handoutRefused, type HandoutDependencies } from '../handouts/handout-routes.ts';
import { sendError } from '../http/errors.ts';
import {
  authenticate,
  parseInput,
  withPerspective,
  type RouteDependencies,
} from '../http/request-context.ts';
import type { LibraryStore } from '../library/library-store.ts';
import type { EnvelopeRecord, EnvelopeStore } from './envelope-store.ts';

/**
 * Sealed envelopes over HTTP (docs/adr/0073-table-ideas.md §9), in the ADR 0009 order.
 * - The party's read (`GET …/envelopes`): the envelopes still sealed, from outside — a label and
 *   what opens it. Read as a party handout is (ADR 0044 §5): a character's view and the party's.
 *   The inside is in no answer of this route, for anyone.
 * - The DM's routes (`…/dm/envelopes`): every envelope with its inside; one sealed from a kept
 *   handout of the library; opened on the DM's word; deleted.
 * Opening gives the inside as a handout to the party, by the path every handout takes; an
 * envelope whose picture the party does not know yet cannot open, and stays sealed.
 */
export interface EnvelopeDependencies {
  readonly store: EnvelopeStore;
  readonly now: () => string;
}

export interface EnvelopeRouteDependencies extends RouteDependencies {
  readonly envelopes: EnvelopeDependencies;
  readonly handouts: HandoutDependencies;
  /** The DM's library: where an envelope's inside is taken from. */
  readonly library: LibraryStore;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const ofEnvelope = params.extend(envelopeParamsSchema.shape).strict();
const query = z.object({ perspective: z.string() }).strict();
const nothing = z.object({}).strict();

/**
 * Opens a sealed envelope: its inside becomes a handout for the party, and the envelope is marked
 * opened — in that order, so an envelope is never marked open with nothing given. False when the
 * party does not know the picture inside (it stays sealed), or it was opened meanwhile.
 */
export async function openEnvelope(
  deps: Pick<EnvelopeRouteDependencies, 'envelopes' | 'handouts'>,
  state: WorldState,
  actor: Actor,
  envelope: EnvelopeRecord,
  by: EnvelopeOpens,
): Promise<boolean> {
  if (envelope.openedAt !== null) return false;
  if (handoutRefused(state, actor, { entityId: envelope.entityId ?? undefined })) return false;
  const at = deps.envelopes.now();
  // Marked first: a second opener then finds it open and gives nothing twice.
  if (!(await deps.envelopes.store.open(envelope.campaignId, envelope.envelopeId, by, at))) {
    return false;
  }
  await deps.handouts.store.add({
    campaignId: envelope.campaignId,
    handoutId: randomUUID(),
    recipientId: null,
    title: envelope.title,
    text: envelope.text,
    entityId: envelope.entityId,
    at: deps.handouts.now(),
  });
  return true;
}

/**
 * A chapter of the party's was written for an evening (docs/adr/0073-table-ideas.md §9.4): every
 * envelope sealed for that evening's chapter — or for the next evening's, whichever it would be —
 * opens. How many opened; never throws into the chapter's own request.
 */
export async function openEnvelopesForChapter(
  deps: Pick<EnvelopeRouteDependencies, 'envelopes' | 'handouts'>,
  state: WorldState,
  actor: Actor,
  campaignId: string,
  sessionId: string,
): Promise<number> {
  let opened = 0;
  for (const envelope of await deps.envelopes.store.list(campaignId)) {
    const waits =
      envelope.openedAt === null &&
      envelope.opens === 'chapter' &&
      (envelope.sessionId === null || envelope.sessionId === sessionId);
    if (waits && (await openEnvelope(deps, state, actor, envelope, 'chapter'))) opened += 1;
  }
  return opened;
}

export function registerEnvelopeRoutes(
  app: FastifyInstance,
  deps: EnvelopeRouteDependencies,
): void {
  const { store, now } = deps.envelopes;

  app.get('/campaigns/:campaignId/envelopes', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { kind } = context.perspective;
    // As a party handout is read: a character's view, the party's, the DM's. Not the public's.
    if (kind !== 'DM' && kind !== 'PARTY' && kind !== 'CHARACTER') {
      return sendError(reply, request, 'FORBIDDEN');
    }
    const body: EnvelopesResponse = {
      perspective: context.perspective.label,
      // Field by field: the inside is never passed through.
      envelopes: (await store.list(path.campaignId))
        .filter((envelope) => envelope.openedAt === null)
        .map((envelope) => ({
          envelopeId: envelope.envelopeId,
          label: envelope.label,
          opens: envelope.opens,
          sealedAt: envelope.sealedAt,
        })),
    };
    return reply.send(body);
  });

  /** The DM's own campaign, or null after sending 401/400/404/403. */
  const asDm = async <P extends { campaignId: string }, B>(
    request: FastifyRequest,
    reply: FastifyReply,
    path: z.ZodType<P>,
    body: z.ZodType<B> | null,
  ) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const where = parseInput(path, request.params, request, reply);
    if (!where) return null;
    const input = body === null ? null : parseInput(body, request.body ?? {}, request, reply);
    if (body !== null && input === null) return null;
    const state = (await deps.engine.load(where.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (role === null || state === null) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    if (role !== 'DM') {
      sendError(reply, request, 'FORBIDDEN');
      return null;
    }
    return { actor, state, path: where, body: input as B };
  };

  const viewOf = (state: WorldState, envelope: EnvelopeRecord): DmEnvelopeView => ({
    envelopeId: envelope.envelopeId,
    label: envelope.label,
    opens: envelope.opens,
    sealedAt: envelope.sealedAt,
    title: envelope.title,
    text: envelope.text,
    picture:
      envelope.entityId === null
        ? null
        : {
            entityId: envelope.entityId,
            name: state.entities.get(envelope.entityId)?.name ?? null,
          },
    evening:
      envelope.sessionId === null
        ? null
        : (state.sessions.get(envelope.sessionId)?.title ?? null),
    openedAt: envelope.openedAt,
    openedBy: envelope.openedBy,
  });

  app.get('/campaigns/:campaignId/dm/envelopes', async (request, reply) => {
    const dm = await asDm(request, reply, params, null);
    if (!dm) return reply;
    const all = await store.list(dm.path.campaignId);
    const body: DmEnvelopesResponse = {
      // The sealed first; then the opened, the latest opened first.
      envelopes: [
        ...all.filter((one) => one.openedAt === null),
        ...all
          .filter((one) => one.openedAt !== null)
          .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? '')),
      ].map((one) => viewOf(dm.state, one)),
      limit: MAX_ENVELOPES,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/dm/envelopes/:envelopeId', async (request, reply) => {
    const dm = await asDm(request, reply, ofEnvelope, sealEnvelopeSchema);
    if (!dm) return reply;
    const { campaignId, envelopeId } = dm.path;
    const kept = await deps.library.get(campaignId, dm.body.entryId);
    const inside = kept?.kind === 'handout' ? kept.body : null;
    if (inside === null) return sendError(reply, request, 'NOT_FOUND');
    // "The chapter of this evening": the session open now; none open, the next to end with one.
    const sealed = await store.seal({
      campaignId,
      envelopeId,
      label: dm.body.label,
      title: inside.title,
      text: inside.text ?? null,
      entityId: inside.entityId ?? null,
      opens: dm.body.opens,
      sessionId: dm.body.opens === 'chapter' ? dm.state.activeSessionId : null,
      sealedAt: now(),
    });
    if (sealed === 'full') return sendError(reply, request, 'CONFLICT');
    return reply.code(sealed === 'sealed' ? 201 : 200).send();
  });

  app.post('/campaigns/:campaignId/dm/envelopes/:envelopeId/open', async (request, reply) => {
    const dm = await asDm(request, reply, ofEnvelope, nothing);
    if (!dm) return reply;
    const { campaignId, envelopeId } = dm.path;
    const envelope = (await store.list(campaignId)).find((one) => one.envelopeId === envelopeId);
    if (!envelope) return sendError(reply, request, 'NOT_FOUND');
    // Open already: the DM's word is taken, and nothing is given twice.
    if (envelope.openedAt !== null) return reply.code(204).send();
    // The party does not know what is pictured inside yet: it stays sealed.
    return (await openEnvelope(deps, dm.state, dm.actor, envelope, 'word'))
      ? reply.code(204).send()
      : sendError(reply, request, 'UNPROCESSABLE');
  });

  app.post('/campaigns/:campaignId/dm/envelopes/:envelopeId/delete', async (request, reply) => {
    const dm = await asDm(request, reply, ofEnvelope, nothing);
    if (!dm) return reply;
    return (await store.delete(dm.path.campaignId, dm.path.envelopeId))
      ? reply.code(204).send()
      : sendError(reply, request, 'NOT_FOUND');
  });
}
