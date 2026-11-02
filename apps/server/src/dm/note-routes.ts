import { randomUUID } from 'node:crypto';

import { dmNoteRequestSchema, type DmNoteView, type DmNotesResponse } from '@ltw/contracts';
import type { Actor, CampaignSnapshot } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { parseInput } from '../http/request-context.ts';
import type { DmRouteDependencies } from './dm-routes.ts';
import type { DmNoteRecord } from './note-store.ts';

/**
 * The DM's notes (docs/adr/0043-dm-screen.md §5) in the DM routes' order (401, 400, 404 for anyone
 * but this campaign's DM): list, write, change and delete. Descriptive DM data; nobody else ever
 * reads them, and the World Engine never sees them.
 */
type AsDm = <B>(
  request: FastifyRequest,
  reply: FastifyReply,
  input: (request: FastifyRequest, reply: FastifyReply) => B | null,
) => Promise<{ actor: Actor; campaignId: string; snapshot: CampaignSnapshot; input: B } | null>;

const noteParams = z.object({ campaignId: z.string(), noteId: z.uuid() }).strict();
const empty = z.object({}).strict().optional();

const viewOf = (note: DmNoteRecord): DmNoteView => ({
  noteId: note.noteId,
  title: note.title,
  body: note.body,
  updatedAt: note.updatedAt,
});

export function registerDmNoteRoutes(
  app: FastifyInstance,
  deps: DmRouteDependencies,
  asDm: AsDm,
): void {
  const { notes, clock } = deps.dm;
  const noteOf = (request: FastifyRequest, reply: FastifyReply) =>
    parseInput(noteParams, request.params, request, reply)?.noteId ?? null;

  app.get('/campaigns/:campaignId/dm/notes', async (request, reply) => {
    const dm = await asDm(request, reply, () => true);
    if (!dm) return reply;
    const body: DmNotesResponse = { notes: (await notes.list(dm.campaignId)).map(viewOf) };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/dm/notes', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) =>
      parseInput(dmNoteRequestSchema, req.body, req, rep),
    );
    if (!dm) return reply;
    const at = clock.now();
    const note: DmNoteRecord = {
      campaignId: dm.campaignId,
      noteId: randomUUID(),
      title: dm.input.title,
      body: dm.input.body,
      createdAt: at,
      updatedAt: at,
    };
    if (!(await notes.create(note))) return sendError(reply, request, 'CONFLICT');
    return reply.code(201).send({ note: viewOf(note) });
  });

  app.post('/campaigns/:campaignId/dm/notes/:noteId', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) => {
      const noteId = noteOf(req, rep);
      if (noteId === null) return null;
      const body = parseInput(dmNoteRequestSchema, req.body, req, rep);
      return body ? { noteId, ...body } : null;
    });
    if (!dm) return reply;
    const { noteId, title, body } = dm.input;
    const changed = await notes.update(dm.campaignId, noteId, {
      title,
      body,
      updatedAt: clock.now(),
    });
    return changed ? reply.code(204).send() : sendError(reply, request, 'NOT_FOUND');
  });

  app.post('/campaigns/:campaignId/dm/notes/:noteId/delete', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) => {
      const noteId = noteOf(req, rep);
      if (noteId === null) return null;
      return parseInput(empty, req.body ?? {}, req, rep) === null ? null : noteId;
    });
    if (!dm) return reply;
    const deleted = await notes.delete(dm.campaignId, dm.input, clock.now());
    return deleted ? reply.code(204).send() : sendError(reply, request, 'NOT_FOUND');
  });
}
