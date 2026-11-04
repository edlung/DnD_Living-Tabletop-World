import {
  MAX_TRACK_BYTES,
  MAX_TRACKS,
  campaignIdSchema,
  trackUploadQuerySchema,
  type ClockResponse,
  type TrackListResponse,
} from '@ltw/contracts';
import { campaignRole, type CampaignRole } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { errorBody, sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import type { LobbyDependencies } from '../table/table-state.ts';
import { sniffAudio, trackView, type TrackStore } from './track-store.ts';

/**
 * The DM's music (docs/adr/0059-atmosphere.md §3): the DM uploads a track — its bytes as the body,
 * its title in the query — lists and deletes them; the campaign's members and its paired
 * displays list and play them, a range at a time as a browser's audio asks; nobody else. What a
 * file is, its first bytes say, whatever the browser called it. Deleting the track that plays
 * stops the music.
 */
export interface MusicRouteDependencies extends RouteDependencies {
  readonly music: TrackStore;
  readonly lobby: LobbyDependencies;
}

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const trackParams = z.object({ campaignId: campaignIdSchema, trackId: z.uuid() }).strict();

/** An open range is answered a part at a time: a browser asks on for the rest. */
const PART_BYTES = 4 * 1024 * 1024;
/** The sound itself: nothing in it runs, whatever it holds. */
const CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

const PLAYERS: ReadonlySet<CampaignRole> = new Set(['DM', 'PLAYER', 'DISPLAY']);

/** The campaign's state and the actor's role in it, once authenticated; null when answered. */
async function roleIn(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: MusicRouteDependencies,
  campaignId: string,
): Promise<CampaignRole | null> {
  const actor = await authenticate(request, reply, deps);
  if (!actor) return null;
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null) {
    sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  return role;
}

/**
 * The bytes a `Range` header asks for, within a track of `size` bytes: one range only; null for
 * the whole track; 'unsatisfiable' past its end.
 */
export function rangeOf(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match) return null;
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return null;
  if (from === '') {
    // The last `to` bytes.
    const last = Math.min(Number(to), size);
    return last === 0 ? 'unsatisfiable' : { start: size - last, end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end =
    to === '' ? Math.min(size - 1, start + PART_BYTES - 1) : Math.min(Number(to), size - 1);
  return end < start ? 'unsatisfiable' : { start, end };
}

export function registerMusicRoutes(app: FastifyInstance, deps: MusicRouteDependencies): void {
  // The server's time, for the music's step on every screen: never part of a watched view.
  app.get('/campaigns/:campaignId/clock', async (request, reply) => {
    const path = parseInput(campaignParams, request.params, request, reply);
    if (!path) return reply;
    const role = await roleIn(request, reply, deps, path.campaignId);
    if (role === null) return reply;
    if (!PLAYERS.has(role)) return sendError(reply, request, 'FORBIDDEN');
    const body: ClockResponse = { now: deps.lobby.now() };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/music', async (request, reply) => {
    const path = parseInput(campaignParams, request.params, request, reply);
    if (!path) return reply;
    const role = await roleIn(request, reply, deps, path.campaignId);
    if (role === null) return reply;
    if (!PLAYERS.has(role)) return sendError(reply, request, 'FORBIDDEN');
    const tracks = await deps.music.list(path.campaignId);
    const body: TrackListResponse = { tracks: tracks.map(trackView), limit: MAX_TRACKS };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/music/:trackId', async (request, reply) => {
    const path = parseInput(trackParams, request.params, request, reply);
    if (!path) return reply;
    const role = await roleIn(request, reply, deps, path.campaignId);
    if (role === null) return reply;
    if (!PLAYERS.has(role)) return sendError(reply, request, 'FORBIDDEN');
    const track = await deps.music.get(path.campaignId, path.trackId);
    if (!track) return sendError(reply, request, 'NOT_FOUND');
    const range = rangeOf(request.headers.range, track.bytes);
    reply.header('accept-ranges', 'bytes');
    if (range === 'unsatisfiable') {
      return reply
        .code(416)
        .header('content-range', `bytes */${String(track.bytes)}`)
        .send(errorBody('INVALID_REQUEST', request.id));
    }
    reply
      .header('content-type', track.mediaType)
      .header('content-security-policy', CONTENT_SECURITY_POLICY);
    const start = range?.start ?? 0;
    const end = range?.end ?? track.bytes - 1;
    const part = await deps.music.read(path.campaignId, path.trackId, start, end - start + 1);
    if (!part) return sendError(reply, request, 'NOT_FOUND');
    if (range) {
      reply
        .code(206)
        .header('content-range', `bytes ${String(start)}-${String(end)}/${String(track.bytes)}`);
    }
    return reply.header('content-length', String(part.byteLength)).send(Buffer.from(part));
  });

  app.post('/campaigns/:campaignId/music/:trackId/delete', async (request, reply) => {
    const path = parseInput(trackParams, request.params, request, reply);
    if (!path) return reply;
    const role = await roleIn(request, reply, deps, path.campaignId);
    if (role === null) return reply;
    if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    if (!(await deps.music.delete(path.campaignId, path.trackId)))
      return sendError(reply, request, 'NOT_FOUND');
    // The track that plays goes with it: the music stops on every screen.
    const table = await deps.lobby.state.read(path.campaignId);
    if (table.sound.music?.trackId === path.trackId) {
      await deps.lobby.state.write(
        path.campaignId,
        { ...table, sound: { ...table.sound, music: null } },
        deps.lobby.now(),
      );
    }
    request.log.info({ trackId: path.trackId }, 'track deleted');
    return reply.code(204).send();
  });

  // The upload's bytes come as they are: only its own route reads them, up to a track's size.
  void app.register((scope, _options, done) => {
    scope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_TRACK_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );
    scope.post(
      '/campaigns/:campaignId/music',
      { bodyLimit: MAX_TRACK_BYTES },
      async (request, reply) => {
        const path = parseInput(campaignParams, request.params, request, reply);
        if (!path) return reply;
        const query = parseInput(trackUploadQuerySchema, request.query, request, reply);
        if (!query) return reply;
        const role = await roleIn(request, reply, deps, path.campaignId);
        if (role === null) return reply;
        if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
        if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0)
          return sendError(reply, request, 'INVALID_REQUEST');
        const content = new Uint8Array(request.body);
        const mediaType = sniffAudio(content);
        if (!mediaType)
          return reply
            .code(400)
            .send({ ...errorBody('INVALID_REQUEST', request.id), reason: 'audio' });
        const added = await deps.music.add({
          campaignId: path.campaignId,
          trackId: randomUUID(),
          requestId: query.requestId,
          title: query.title,
          mediaType,
          addedAt: deps.lobby.now(),
          content,
        });
        if (added === 'limit')
          return reply.code(409).send({ ...errorBody('CONFLICT', request.id), reason: 'limit' });
        request.log.info({ trackId: added.trackId, bytes: added.bytes }, 'track added');
        return reply.code(201).send(trackView(added));
      },
    );
    done();
  });
}
