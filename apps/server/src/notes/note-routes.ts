import {
  MAX_PLAYER_NOTES,
  backstoryRequestSchema,
  campaignIdSchema,
  entityIdSchema,
  playerNoteRequestSchema,
  type BackstoryResponse,
  type PlayerNoteView,
  type PlayerNotesResponse,
} from '@ltw/contracts';
import type { ResolvedPerspective } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { NoteOwner, NoteStore, PlayerNoteRecord } from './note-store.ts';

/**
 * A hero's backstory and a player's private notes over HTTP (docs/adr/0073-table-ideas.md §5), in
 * the ADR 0009 order.
 * - The backstory of a character: its own player (in that character's view) and the DM read and
 *   write it; another player, the party's shared view, the public view, a table display and a
 *   stranger do neither.
 * - Private notes: whoever asks reads and writes their own — the notes their own actor wrote, as
 *   the character whose view they hold — and there is no request that names another's. The DM's
 *   view holds none (the DM's notes are ADR 0043 §5's); a DM playing a character keeps the DM's
 *   own notes as that character and never reads its player's.
 */
export interface NoteDependencies {
  readonly store: NoteStore;
  readonly now: () => string;
}

export interface NoteRouteDependencies extends RouteDependencies {
  readonly notes: NoteDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const ofCharacter = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const ofNote = z.object({ campaignId: campaignIdSchema, noteId: z.uuid() }).strict();
const query = z.object({ perspective: z.string() }).strict();
const nothing = z.object({}).strict();
const WRITES_PER_MINUTE = 30;

const viewOf = (note: PlayerNoteRecord): PlayerNoteView => ({
  noteId: note.noteId,
  title: note.title,
  body: note.body,
  updatedAt: note.updatedAt,
});

/** Who may read and write a character's backstory: the DM, and its own player in its view. */
const backstoryRole = (
  perspective: ResolvedPerspective,
  characterId: string,
): 'dm' | 'player' | null =>
  perspective.kind === 'DM'
    ? 'dm'
    : perspective.kind === 'CHARACTER' && perspective.holderId === characterId
      ? 'player'
      : null;

export function registerNoteRoutes(app: FastifyInstance, deps: NoteRouteDependencies): void {
  const { store, now } = deps.notes;
  const limit = new WindowCounter({ limit: WRITES_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });
  const limited = (campaignId: string, actorId: string) =>
    limit.take(`${campaignId}\n${actorId}`, Date.now()) === 'limited';

  app.get('/campaigns/:campaignId/entities/:entityId/backstory', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params: ofCharacter, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    if (backstoryRole(context.perspective, path.entityId) === null) {
      return sendError(reply, request, 'FORBIDDEN');
    }
    if (context.state.entities.get(path.entityId)?.kind !== 'character') {
      return sendError(reply, request, 'NOT_FOUND');
    }
    const record = await store.backstory(path.campaignId, path.entityId);
    const body: BackstoryResponse = {
      perspective: context.perspective.label,
      characterId: path.entityId,
      body: record?.body ?? '',
      writtenBy: record?.writtenBy ?? null,
      updatedAt: record?.updatedAt ?? null,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/entities/:entityId/backstory', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params: ofCharacter,
      body: backstoryRequestSchema,
    });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const role = backstoryRole(context.perspective, path.entityId);
    if (role === null) return sendError(reply, request, 'FORBIDDEN');
    if (context.state.entities.get(path.entityId)?.kind !== 'character') {
      return sendError(reply, request, 'NOT_FOUND');
    }
    if (limited(path.campaignId, context.actor.actorId)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    await store.writeBackstory({
      campaignId: path.campaignId,
      characterId: path.entityId,
      body: body.body,
      writtenBy: role,
      updatedAt: now(),
    });
    return reply.code(204).send();
  });

  /** The asker's own notes as the character whose view they hold; null for any other view. */
  const ownerOf = (
    campaignId: string,
    actorId: string,
    perspective: ResolvedPerspective,
  ): NoteOwner | null =>
    perspective.kind === 'CHARACTER' && perspective.holderId !== null
      ? { campaignId, ownerId: actorId, characterId: perspective.holderId }
      : null;

  app.get('/campaigns/:campaignId/notes', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const owner = ownerOf(path.campaignId, context.actor.actorId, context.perspective);
    if (owner === null) return sendError(reply, request, 'FORBIDDEN');
    const notes = await store.notes(owner);
    const body: PlayerNotesResponse = {
      perspective: context.perspective.label,
      notes: notes.map(viewOf),
      room: notes.length < MAX_PLAYER_NOTES,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/notes', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: playerNoteRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const owner = ownerOf(path.campaignId, context.actor.actorId, context.perspective);
    if (owner === null) return sendError(reply, request, 'FORBIDDEN');
    if (limited(path.campaignId, context.actor.actorId)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const written = await store.writeNote({
      ...owner,
      noteId: body.noteId,
      title: body.title,
      body: body.body,
      updatedAt: now(),
    });
    // No room for one more, or the ID is a note kept as another character.
    return written ? reply.code(204).send() : sendError(reply, request, 'CONFLICT');
  });

  app.post('/campaigns/:campaignId/notes/:noteId/delete', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params: ofNote, body: nothing });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const owner = ownerOf(path.campaignId, context.actor.actorId, context.perspective);
    if (owner === null) return sendError(reply, request, 'FORBIDDEN');
    await store.deleteNote(owner, path.noteId);
    return reply.code(204).send();
  });
}
