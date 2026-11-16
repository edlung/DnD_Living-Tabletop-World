import {
  campaignIdSchema,
  musicAfter,
  placeSoundParamsSchema,
  placeSoundRequestSchema,
  type PlaceSound,
  type PlaceSoundsResponse,
} from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import type { TrackStore } from '../music/track-store.ts';
import type { LobbyDependencies } from '../table/table-state.ts';
import type { PlaceSoundStore } from './place-sound-store.ts';

/**
 * A place's own sound (docs/adr/0073-table-ideas.md §6): the DM keeps an ambience and a track for
 * a place, and showing that place on the table's screens (`POST …/display/cast`, a scene) writes
 * them into the table's one sound state — nothing else does: not the party's walking, not a live
 * signal. The DM's own controls change the sound afterwards as before.
 */
export interface PlaceSoundDependencies {
  readonly store: PlaceSoundStore;
  /** The table's state: where what plays is kept (ADR 0059). */
  readonly lobby: LobbyDependencies;
  /** The DM's tracks: a track deleted since is not played. */
  readonly music: TrackStore;
}

/** What showing a place did to the table's sound. */
export interface AppliedSound {
  readonly ambience: boolean;
  readonly music: boolean;
}

/**
 * Applies the place's sound to the table's state, at the DM's showing of it. The ambience is set
 * when the place brings one; its track starts from the beginning, on repeat, unless that very
 * track is the one already playing (showing the same place twice does not restart the music) or
 * the track is gone. Null when the place brings nothing.
 */
export async function applyPlaceSound(
  deps: PlaceSoundDependencies,
  campaignId: string,
  locationId: string,
): Promise<AppliedSound | null> {
  const sound = await deps.store.get(campaignId, locationId);
  if (sound === null) return null;
  const before = await deps.lobby.state.read(campaignId);
  const now = deps.lobby.now();
  const track =
    sound.trackId === null ? null : await deps.music.get(campaignId, sound.trackId);
  const playing = before.sound.music;
  const same = track !== null && playing?.trackId === track.trackId && playing.pausedAt === null;
  const music =
    track === null || same
      ? playing
      : musicAfter(
          playing,
          { action: 'play', trackId: track.trackId, repeat: true },
          Date.parse(now),
        );
  const ambience = sound.ambience ?? before.sound.ambience;
  const applied = {
    ambience: sound.ambience !== null && sound.ambience !== before.sound.ambience,
    music: music !== playing,
  };
  if (applied.ambience || applied.music) {
    await deps.lobby.state.write(campaignId, { ...before, sound: { ambience, music } }, now);
  }
  return applied;
}

export interface PlaceSoundRouteDependencies extends RouteDependencies {
  readonly placeSounds: PlaceSoundDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const ofPlace = params.extend(placeSoundParamsSchema.shape).strict();

/**
 * The DM's routes for places' sounds, in the DM routes' order (401, 400, 404 for anyone but this
 * campaign's DM): the list, and one place's sound saved or — brought to nothing — taken away.
 */
export function registerPlaceSoundRoutes(
  app: FastifyInstance,
  deps: PlaceSoundRouteDependencies,
): void {
  const { store, lobby, music } = deps.placeSounds;

  /** The DM's own campaign's state, or null after sending 401/400/404. */
  const asDm = async <P extends { campaignId: string }>(
    request: FastifyRequest,
    reply: FastifyReply,
    schema: z.ZodType<P>,
  ) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(schema, request.params, request, reply);
    if (!path) return null;
    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    if (state === null || campaignRole(state, actor) !== 'DM') {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { path, state };
  };

  app.get('/campaigns/:campaignId/dm/place-sounds', async (request, reply) => {
    const dm = await asDm(request, reply, params);
    if (!dm) return reply;
    const body: PlaceSoundsResponse = { sounds: await store.list(dm.path.campaignId) };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/dm/place-sounds/:locationId', async (request, reply) => {
    const dm = await asDm(request, reply, ofPlace);
    if (!dm) return reply;
    const body = parseInput(placeSoundRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const { campaignId, locationId } = dm.path;
    if (dm.state.entities.get(locationId)?.kind !== 'location') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    // A track named must be one of the campaign's now.
    if (body.trackId !== null && !(await music.get(campaignId, body.trackId))) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const sound: PlaceSound = { locationId, ambience: body.ambience, trackId: body.trackId };
    return (await store.put(campaignId, sound, lobby.now()))
      ? reply.code(204).send()
      : sendError(reply, request, 'CONFLICT');
  });
}
