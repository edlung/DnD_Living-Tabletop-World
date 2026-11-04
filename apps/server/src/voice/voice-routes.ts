import { createHmac } from 'node:crypto';

import {
  campaignIdSchema,
  voiceMuteSchema,
  voiceRemoveSchema,
  voiceSignalSchema,
  type VoiceIceResponse,
} from '@ltw/contracts';
import { campaignRole, controlledCharacter, type WorldState } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { CampaignMoves } from '../campaigns/move/moves.ts';
import { actorFor } from '../http/auth.ts';
import { sendError } from '../http/errors.ts';
import {
  authenticate,
  credentialsOf,
  parseInput,
  type RouteDependencies,
} from '../http/request-context.ts';
import { responseSink, streamHeaders } from '../live/stream.ts';
import type { LobbyDependencies } from '../table/table-state.ts';
import type { Speaker, VoiceRooms } from './voice-rooms.ts';

/**
 * The table's voice (docs/adr/0060-voice.md): `GET …/voice/stream` joins the campaign's room and
 * carries who is in it and the other speakers' signals; `POST …/voice/signal` sends one to another
 * speaker; the DM mutes and removes (`…/voice/mute`, `…/voice/remove`); `GET …/voice/ice` gives the
 * relay's short-lived credentials when one is set. Only while a session plays online, only the DM
 * and players with a character; a display never joins.
 */
export interface VoiceRelay {
  /** The relay's addresses (`turn:…`, `turns:…`, `stun:…`). */
  readonly urls: readonly string[];
  /** The relay's shared secret (coturn's `static-auth-secret`), never printed nor sent. */
  readonly secret: { reveal(): string };
}

export interface VoiceRouteDependencies extends RouteDependencies {
  readonly voice: VoiceRooms;
  readonly lobby: LobbyDependencies;
  readonly relay: VoiceRelay | null;
  readonly credentialHeader: 'Authorization' | 'Cookie';
  /** Where the campaign plays: away, its room closes (docs/adr/0061-local-mode.md §5). */
  readonly moves?: CampaignMoves;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
/** A relay credential lasts an hour: a screen asks again when it joins. */
const CREDENTIAL_SECONDS = 60 * 60;
/** How often a speaker's right to be in the room is checked again. */
const RECHECK_MS = 20_000;

/** The speaker the actor may be in the campaign's room, with the state; null when answered. */
async function speakerIn(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: VoiceRouteDependencies,
  campaignId: string,
): Promise<{ speaker: Speaker; state: WorldState } | null> {
  const actor = await authenticate(request, reply, deps);
  if (!actor) return null;
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (role === null || state === null) {
    sendError(reply, request, 'NOT_FOUND');
    return null;
  }
  if (role !== 'DM' && role !== 'PLAYER') {
    sendError(reply, request, 'FORBIDDEN');
    return null;
  }
  const character = role === 'PLAYER' ? controlledCharacter(state, actor.actorId) : null;
  return {
    speaker: {
      actorId: actor.actorId,
      name: character === null ? null : (state.entities.get(character)?.name ?? null),
      dm: role === 'DM',
    },
    state,
  };
}

/** Whether the table plays online in an open session: the room is open then only. */
async function roomOpen(deps: VoiceRouteDependencies, campaignId: string, state: WorldState) {
  return (
    state.activeSessionId !== null && (await deps.lobby.state.read(campaignId)).mode === 'online'
  );
}

/**
 * Whether the speaker may still be in the room: the same sign-in, still the DM or a player, the
 * session still played online, the campaign at home. A revoked seat, a deleted account, the
 * session's end or a move closes the speaker's stream within a recheck.
 */
async function stillSpeaker(
  deps: VoiceRouteDependencies,
  campaignId: string,
  credentials: ReturnType<typeof credentialsOf>,
  actorId: string,
): Promise<boolean> {
  const principal = await deps.authenticator.authenticate(credentials);
  const actor = principal === null ? null : actorFor(principal, campaignId);
  if (actor?.actorId !== actorId) return false;
  const state = (await deps.engine.load(campaignId))?.state ?? null;
  const role = campaignRole(state, actor);
  if (state === null || (role !== 'DM' && role !== 'PLAYER')) return false;
  if (!(await roomOpen(deps, campaignId, state))) return false;
  const away = deps.moves ? await deps.moves.awayOf(campaignId) : null;
  return away === null;
}

/** coturn's REST credentials: `<expiry>:<name>` and the HMAC-SHA1 of it with the shared secret. */
export function relayCredentials(
  relay: VoiceRelay,
  name: string,
  now: number,
): VoiceIceResponse['iceServers'][number] {
  const username = `${String(Math.floor(now / 1000) + CREDENTIAL_SECONDS)}:${name}`;
  const credential = createHmac('sha1', relay.secret.reveal()).update(username).digest('base64');
  return { urls: [...relay.urls], username, credential };
}

export function registerVoiceRoutes(app: FastifyInstance, deps: VoiceRouteDependencies): void {
  app.get('/campaigns/:campaignId/voice/stream', async (request, reply) => {
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const joined = await speakerIn(request, reply, deps, path.campaignId);
    if (!joined) return reply;
    if (!(await roomOpen(deps, path.campaignId, joined.state)))
      return sendError(reply, request, 'CONFLICT');
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { ...streamHeaders(deps.credentialHeader), 'x-request-id': request.id });
    raw.flushHeaders();
    const sink = responseSink(raw);
    const peerId = deps.voice.join(path.campaignId, joined.speaker, sink);
    if (peerId === null) return reply;
    const credentials = credentialsOf(request);
    const recheck = setInterval(() => {
      void stillSpeaker(deps, path.campaignId, credentials, joined.speaker.actorId)
        .then((still) => {
          if (!still) deps.voice.dismiss(path.campaignId, peerId);
        })
        .catch(() => undefined);
    }, RECHECK_MS);
    recheck.unref();
    sink.onClose(() => {
      clearInterval(recheck);
    });
    return reply;
  });

  app.post('/campaigns/:campaignId/voice/signal', async (request, reply) => {
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(voiceSignalSchema, request.body, request, reply);
    if (!body) return reply;
    const joined = await speakerIn(request, reply, deps, path.campaignId);
    if (!joined) return reply;
    const sent = deps.voice.signal(path.campaignId, joined.speaker.actorId, body);
    if (sent === 'absent') return sendError(reply, request, 'CONFLICT');
    if (sent === 'limited') return reply.code(429).send({ error: { code: 'LIMITED' } });
    return reply.code(204).send();
  });

  /** The DM's word on one speaker: mute (or let talk), or remove; who is not in the room is 404. */
  const dmOnly = async (
    request: FastifyRequest,
    reply: FastifyReply,
    act: (campaignId: string) => boolean | null,
  ) => {
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const joined = await speakerIn(request, reply, deps, path.campaignId);
    if (!joined) return reply;
    if (!joined.speaker.dm) return sendError(reply, request, 'FORBIDDEN');
    const done = act(path.campaignId);
    if (done === null) return reply;
    if (!done) return sendError(reply, request, 'NOT_FOUND');
    request.log.info('voice changed');
    return reply.code(204).send();
  };

  app.post('/campaigns/:campaignId/voice/mute', (request, reply) =>
    dmOnly(request, reply, (campaignId) => {
      const body = parseInput(voiceMuteSchema, request.body, request, reply);
      return body ? deps.voice.mute(campaignId, body.peerId, body.muted) : null;
    }),
  );

  app.post('/campaigns/:campaignId/voice/remove', (request, reply) =>
    dmOnly(request, reply, (campaignId) => {
      const body = parseInput(voiceRemoveSchema, request.body, request, reply);
      return body ? deps.voice.remove(campaignId, body.peerId) : null;
    }),
  );

  app.get('/campaigns/:campaignId/voice/ice', async (request, reply) => {
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const joined = await speakerIn(request, reply, deps, path.campaignId);
    if (!joined) return reply;
    // The relay's credentials only while the room is open: never a proxy between sessions.
    if (!(await roomOpen(deps, path.campaignId, joined.state)))
      return sendError(reply, request, 'CONFLICT');
    const body: VoiceIceResponse = {
      iceServers: deps.relay
        ? [relayCredentials(deps.relay, path.campaignId, Date.parse(deps.lobby.now()))]
        : [],
    };
    return reply.send(body);
  });
}
