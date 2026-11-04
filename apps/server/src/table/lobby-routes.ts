import {
  campaignIdSchema,
  lobbyChangeRequestSchema,
  lobbyReadyRequestSchema,
  musicAfter,
  type LobbyResponse,
} from '@ltw/contracts';
import { campaignOptions } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import { presenceView } from '../live/presence.ts';
import type { PresenceSource } from '../live/registry.ts';
import type { TrackStore } from '../music/track-store.ts';
import type { LobbyDependencies } from './table-state.ts';

/**
 * A session's lobby (docs/adr/0043-dm-screen.md §6), in the ADR 0009 order: who is here (the
 * perspective's own characters, as presence lists them), who said "ready" for the session to
 * come, whose player is absent; the table's mode and whether the DM paused it; what the table
 * hears (docs/adr/0059-atmosphere.md). A player says "ready" for their own character; the DM
 * changes the rest.
 */
export interface LobbyRouteDependencies extends RouteDependencies {
  readonly lobby: LobbyDependencies;
  readonly presence: PresenceSource;
  /** The DM's tracks: a track played must be one of the campaign's. */
  readonly music: TrackStore;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

export function registerLobbyRoutes(app: FastifyInstance, deps: LobbyRouteDependencies): void {
  const { lobby } = deps;

  app.get('/campaigns/:campaignId/lobby', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { state } = context;
    const table = await lobby.state.read(path.campaignId);
    const session =
      state.activeSessionId === null ? null : state.sessions.get(state.activeSessionId);
    const sayReady = lobby.ready.readyFor(path.campaignId, state.activeSessionId);
    const here = presenceView(state, context.perspective, (actorId) =>
      deps.presence.connected(path.campaignId, actorId),
    );
    const body: LobbyResponse = {
      perspective: context.perspective.label,
      mode: table.mode,
      paused: table.paused,
      dice: table.dice,
      session: session ? { sessionId: session.sessionId, title: session.title } : null,
      characters: here.characters.map(({ character, present }) => ({
        character,
        present,
        ready: sayReady.has(character.entityId),
        absent: table.absent.includes(character.entityId),
      })),
      options: campaignOptions(state),
      sound: table.sound,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/lobby/ready', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: lobbyReadyRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    // A player for their own character; the DM for anyone at the table.
    const own = perspective.kind === 'CHARACTER' && perspective.holderId === body.characterId;
    if (perspective.kind !== 'DM' && !own) return sendError(reply, request, 'FORBIDDEN');
    if (state.entities.get(body.characterId)?.kind !== 'character')
      return sendError(reply, request, 'UNPROCESSABLE');
    lobby.ready.set(path.campaignId, body.characterId, body.ready, state.activeSessionId);
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/lobby', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: lobbyChangeRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const before = await lobby.state.read(path.campaignId);
    const absent = new Set(before.absent);
    if (body.absent) {
      if (context.state.entities.get(body.absent.characterId)?.kind !== 'character')
        return sendError(reply, request, 'UNPROCESSABLE');
      if (body.absent.absent) absent.add(body.absent.characterId);
      else absent.delete(body.absent.characterId);
    }
    if (
      body.music?.action === 'play' &&
      !(await deps.music.get(path.campaignId, body.music.trackId))
    )
      return sendError(reply, request, 'NOT_FOUND');
    const now = lobby.now();
    const next = {
      mode: body.mode ?? before.mode,
      paused: body.paused ?? before.paused,
      absent: [...absent].sort(),
      dice: body.dice ?? before.dice,
      sound: {
        ambience: body.ambience ?? before.sound.ambience,
        music:
          body.music === undefined
            ? before.sound.music
            : musicAfter(before.sound.music, body.music, Date.parse(now)),
      },
    };
    await lobby.state.write(path.campaignId, next, now);
    request.log.info(
      {
        mode: next.mode,
        paused: next.paused,
        dice: next.dice,
        ambience: next.sound.ambience,
        music: body.music?.action ?? null,
      },
      'table changed',
    );
    return reply.code(204).send();
  });
}
