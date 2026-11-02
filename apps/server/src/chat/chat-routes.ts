import { randomUUID } from 'node:crypto';

import {
  CHAT_PAGE,
  campaignIdSchema,
  chatMessageRequestSchema,
  type ChatLogResponse,
  type ChatMessageView,
} from '@ltw/contracts';
import { knownEntityIds, type ResolvedPerspective, type WorldState } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { ChatRecord, ChatStore } from './chat-store.ts';

/**
 * Table talk over HTTP (docs/adr/0044-online-play.md §1), in the ADR 0009 order. The DM reads
 * everything; a player, in their character's perspective, reads the table's chat, their own
 * whispers to the DM and the DM's words to them; any other perspective reads the table's chat;
 * a table display reads none. Names are the perspective's own (an unknown speaker is unnamed).
 */
export interface ChatDependencies {
  readonly store: ChatStore;
  readonly now: () => string;
}

export interface ChatRouteDependencies extends RouteDependencies {
  readonly chat: ChatDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();
const MESSAGES_PER_MINUTE = 30;

/** Whether this perspective reads the message. */
function reads(perspective: ResolvedPerspective, record: ChatRecord): boolean {
  if (perspective.kind === 'DM') return true;
  if (record.channel === 'table') return true;
  if (perspective.kind !== 'CHARACTER') return false;
  return record.channel === 'dm'
    ? record.speakerId === perspective.holderId
    : record.recipientId === perspective.holderId;
}

function viewOf(
  state: WorldState,
  known: ReadonlySet<string>,
  record: ChatRecord,
): ChatMessageView {
  const ref = (id: string | null) =>
    id === null
      ? null
      : { entityId: id, name: known.has(id) ? (state.entities.get(id)?.name ?? null) : null };
  return {
    messageId: record.messageId,
    channel: record.channel,
    voice: record.voice,
    speaker: ref(record.speakerId),
    recipient: ref(record.recipientId),
    text: record.text,
    at: record.at,
  };
}

export function registerChatRoutes(app: FastifyInstance, deps: ChatRouteDependencies): void {
  const { store, now } = deps.chat;
  const limit = new WindowCounter({
    limit: MESSAGES_PER_MINUTE,
    windowMs: 60_000,
    maxKeys: 10_000,
  });

  app.get('/campaigns/:campaignId/chat', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    // A table display shows what the DM casts, never the table's talk.
    if (context.actor.kind === 'display') return sendError(reply, request, 'FORBIDDEN');
    const known = knownEntityIds(context.state, context.perspective);
    const body: ChatLogResponse = {
      perspective: context.perspective.label,
      messages: (await store.recent(path.campaignId, CHAT_PAGE * 4))
        .filter((record) => reads(context.perspective, record))
        .slice(-CHAT_PAGE)
        .map((record) => viewOf(context.state, known, record)),
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/chat', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: chatMessageRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    const dm = perspective.kind === 'DM';
    const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
    // The DM speaks to the table or to one player; a player, as their character, to the table or
    // to the DM. Nobody else speaks.
    const allowed = dm
      ? body.channel === 'table' || body.channel === 'player'
      : holder !== null && (body.channel === 'table' || body.channel === 'dm');
    if (!allowed) return sendError(reply, request, 'FORBIDDEN');
    if ((body.channel === 'player') !== (body.recipientId !== undefined))
      return sendError(reply, request, 'INVALID_REQUEST');
    if (
      body.recipientId !== undefined &&
      state.entities.get(body.recipientId)?.kind !== 'character'
    ) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const record: ChatRecord = {
      campaignId: path.campaignId,
      messageId: randomUUID(),
      channel: body.channel,
      voice: body.voice,
      speakerId: holder,
      recipientId: body.recipientId ?? null,
      text: body.text,
      at: now(),
    };
    await store.add(record);
    const known = knownEntityIds(state, perspective);
    return reply.code(201).send({ message: viewOf(state, known, record) });
  });
}
