import { randomInt, randomUUID } from 'node:crypto';

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DEFAULT_CAST,
  DISPLAY_DAYS,
  MAX_DISPLAYS,
  PAIRING_MINUTES,
  campaignIdSchema,
  castSchema,
  entityIdSchema,
  pairDisplayRequestSchema,
  renameDisplayRequestSchema,
  type Cast,
  type CastResponse,
  type DisplayJoinResponse,
  type DisplayListResponse,
  type DisplayPairingResponse,
  type DisplaySessionResponse,
  type DisplayView,
} from '@ltw/contracts';
import {
  campaignRole,
  knownEntityIds,
  partyMemberIds,
  resolvePerspective,
  type Actor,
  type WorldState,
} from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { iso } from '../auth/session-authenticator.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import {
  clearedCookie,
  cookieTokenFrom,
  credentialCookie,
  hashToken,
  newToken,
  secureCookies,
} from '../auth/tokens.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import { DISPLAY_COOKIE } from './display-authenticator.ts';
import type { DisplayLimits } from './display-limits.ts';
import type { DisplayRecord, DisplayStore } from './display-store.ts';
import type { OpenTableLinks } from './table-links.ts';

/**
 * The table display (docs/adr/0042-table-display.md): a device asks to pair and shows its code;
 * the DM types the code on the Displays sheet; the paired device reads the campaign's PUBLIC and
 * PARTY views and the DM's cast through the usual routes, and nothing else. The DM lists,
 * renames and unpairs displays, sets the cast, and the device shows the open table link's QR code.
 */
export interface DisplayRouteDependencies extends RouteDependencies {
  readonly signIn: SignInDependencies;
  readonly displays: DisplayStore;
  readonly displayLimits: DisplayLimits;
  readonly openLinks: OpenTableLinks;
}

const DAY_MS = 24 * 60 * 60_000;
const params = z.object({ campaignId: campaignIdSchema }).strict();
const displayParams = z.object({ campaignId: campaignIdSchema, displayId: z.uuid() }).strict();
const emptyBody = z.object({}).strict().optional();
const castBody = z.object({ cast: castSchema }).strict();

/** A code to read aloud and type: eight symbols without look-alikes. */
export const newCode = (): string =>
  Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(
    '',
  );

const viewOf = (display: DisplayRecord): DisplayView => ({
  displayId: display.displayId,
  name: display.name ?? '',
  pairedAt: display.pairedAt ?? display.createdAt,
  lastSeenAt: display.lastSeenAt,
});

/**
 * Where a scene cast without a place looks: the first of the party's characters with a place,
 * by name, else the active scene's place. The party knows where it is.
 */
export function partyPlace(state: WorldState): string | null {
  const party = [...partyMemberIds(state)]
    .map((id) => state.entities.get(id))
    .filter((entity) => entity?.placement?.locationId !== undefined)
    .sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''));
  const placed = party[0]?.placement?.locationId;
  if (placed) return placed;
  const scene = state.activeSceneId === null ? undefined : state.scenes.get(state.activeSceneId);
  return scene?.locationId ?? null;
}

/**
 * The cast as anyone below the DM reads it: a place, a picture or a combatant the party does not
 * know is none — a scene without a place, a dark screen, whoever acts — so not even its ID reaches
 * a display or a player.
 */
export function castForParty(
  state: WorldState,
  actor: Actor,
  cast: Cast,
  place: string | null,
): { readonly cast: Cast; readonly place: string | null } {
  const access = resolvePerspective(state, actor, { kind: 'PARTY' });
  const known = access.ok ? knownEntityIds(state, access.perspective) : new Set<string>();
  const seen = (id: string | null): id is string => id !== null && known.has(id);
  const shown = seen(place) ? place : null;
  switch (cast.kind) {
    case 'scene':
      return {
        cast: { kind: 'scene', locationId: seen(cast.locationId) ? cast.locationId : null },
        place: shown,
      };
    case 'picture':
      return { cast: seen(cast.entityId) ? cast : { kind: 'blank' }, place: shown };
    case 'battlefield':
      return { cast: { ...cast, focus: seen(cast.focus) ? cast.focus : null }, place: shown };
    default:
      return { cast, place: shown };
  }
}

export function registerDisplayRoutes(app: FastifyInstance, deps: DisplayRouteDependencies): void {
  const { displays, displayLimits, signIn } = deps;
  const secure = secureCookies(signIn.publicOrigin);
  const now = () => iso(signIn.clock.now());

  /** The campaign as one of its members holds it; `dm` asks for its DM. Null once answered. */
  const member = async (
    request: FastifyRequest,
    reply: FastifyReply,
    actor: Actor,
    campaignId: string,
    dm: boolean,
  ): Promise<WorldState | null> => {
    const state = (await deps.engine.load(campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (state === null || role === null || role === 'SYSTEM') {
      await sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    if (dm && role !== 'DM') {
      await sendError(reply, request, 'FORBIDDEN');
      return null;
    }
    return state;
  };

  app.post('/display/pair', async (request, reply) => {
    if (!emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    if (!displayLimits.pairing(clientGroup(request.ip))) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const token = newToken();
    const code = newCode();
    const at = signIn.clock.now();
    const codeExpiresAt = iso(at + PAIRING_MINUTES * 60_000);
    await displays.createDisplay({
      displayId: randomUUID(),
      tokenHash: hashToken(token),
      codeHash: hashToken(code),
      codeExpiresAt,
      createdAt: iso(at),
      expiresAt: iso(at + DISPLAY_DAYS * DAY_MS),
    });
    request.log.info('display pairing requested');
    const response: DisplayPairingResponse = { code, expiresAt: codeExpiresAt };
    return reply
      .code(201)
      .header(
        'set-cookie',
        credentialCookie(DISPLAY_COOKIE, token, (DISPLAY_DAYS * DAY_MS) / 1000, secure),
      )
      .send(response);
  });

  app.get('/display/session', async (request, reply) => {
    const token = cookieTokenFrom(request.headers.cookie, DISPLAY_COOKIE);
    const display = token === null ? null : await displays.findDisplay(hashToken(token));
    const at = now();
    if (!display || display.revokedAt !== null || display.expiresAt <= at) {
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    if (display.campaignId === null) {
      if (display.codeExpiresAt <= at) return sendError(reply, request, 'UNAUTHENTICATED');
      const pending: DisplaySessionResponse = {
        state: 'pending',
        expiresAt: display.codeExpiresAt,
      };
      return reply.send(pending);
    }
    const campaign = (await deps.engine.load(display.campaignId))?.state.campaign;
    if (!campaign) return sendError(reply, request, 'UNAUTHENTICATED');
    const paired: DisplaySessionResponse = {
      state: 'paired',
      campaignId: display.campaignId,
      campaignName: campaign.name,
      language: campaign.language,
      name: display.name ?? '',
    };
    return reply.send(paired);
  });

  /** The device unpairs itself ("Disconnect this screen"). */
  app.post('/display/forget', async (request, reply) => {
    if (!emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const token = cookieTokenFrom(request.headers.cookie, DISPLAY_COOKIE);
    const display = token === null ? null : await displays.findDisplay(hashToken(token));
    if (display?.campaignId)
      await displays.revokeDisplays(display.campaignId, display.displayId, now());
    return reply.code(204).header('set-cookie', clearedCookie(DISPLAY_COOKIE, secure)).send();
  });

  app.post('/campaigns/:campaignId/displays', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(pairDisplayRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const state = await member(request, reply, actor, path.campaignId, true);
    if (!state) return reply;
    if (!displayLimits.dmCode(`${path.campaignId}\n${actor.actorId}`)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const at = now();
    const count = (await displays.campaignDisplays(path.campaignId, at)).length;
    const paired = await displays.pairDisplay(
      hashToken(body.code),
      path.campaignId,
      body.name ?? `${state.campaign?.language === 'ru' ? 'Экран' : 'TV'} ${String(count + 1)}`,
      actor.actorId,
      at,
      MAX_DISPLAYS,
    );
    if (paired === 'full') {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'Too many displays', requestId: request.id },
        reason: 'full',
      });
    }
    if (paired === null) return sendError(reply, request, 'NOT_FOUND');
    request.log.info({ displayId: paired.displayId }, 'display paired');
    return reply.code(201).send(viewOf(paired));
  });

  app.get('/campaigns/:campaignId/displays', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    if (!(await member(request, reply, actor, path.campaignId, true))) return reply;
    const response: DisplayListResponse = {
      displays: (await displays.campaignDisplays(path.campaignId, now())).map(viewOf),
      limit: MAX_DISPLAYS,
    };
    return reply.send(response);
  });

  app.post('/campaigns/:campaignId/displays/:displayId/name', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(displayParams, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(renameDisplayRequestSchema, request.body, request, reply);
    if (!body) return reply;
    if (!(await member(request, reply, actor, path.campaignId, true))) return reply;
    const renamed = await displays.renameDisplay(path.campaignId, path.displayId, body.name);
    return renamed ? reply.code(204).send() : sendError(reply, request, 'NOT_FOUND');
  });

  /** Unpairs one display, or (`one` false) every display of the campaign. */
  const revoke = (one: boolean) => async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = one
      ? parseInput(displayParams, request.params, request, reply)
      : parseInput(params, request.params, request, reply);
    if (!path) return reply;
    if (!emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    if (!(await member(request, reply, actor, path.campaignId, true))) return reply;
    const target =
      'displayId' in path && typeof path.displayId === 'string' ? path.displayId : null;
    const revoked = await displays.revokeDisplays(path.campaignId, target, now());
    request.log.info({ revoked }, 'displays unpaired');
    return reply.send({ revoked });
  };
  app.post('/campaigns/:campaignId/displays/revoke', revoke(false));
  app.post('/campaigns/:campaignId/displays/:displayId/revoke', revoke(true));

  app.get('/campaigns/:campaignId/display/cast', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const state = await member(request, reply, actor, path.campaignId, false);
    if (!state) return reply;
    const stored = await displays.readCast(path.campaignId);
    const parsed = stored ? castSchema.safeParse(stored.cast) : null;
    const cast: Cast = parsed?.success ? parsed.data : DEFAULT_CAST;
    // A scene cast without its own place shows where the party is; the battlefield, where the
    // fight is (its approved pictures and battle map).
    const place =
      cast.kind === 'scene'
        ? (cast.locationId ?? partyPlace(state))
        : cast.kind === 'battlefield'
          ? (state.encounter?.locationId ?? null)
          : null;
    const shown =
      campaignRole(state, actor) === 'DM'
        ? { cast, place }
        : castForParty(state, actor, cast, place);
    const response: CastResponse & { readonly place: string | null } = {
      ...shown,
      revision: stored?.revision ?? 0,
    };
    return reply.send(response);
  });

  app.post('/campaigns/:campaignId/display/cast', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(castBody, request.body, request, reply);
    if (!body) return reply;
    const state = await member(request, reply, actor, path.campaignId, true);
    if (!state) return reply;
    const named =
      body.cast.kind === 'scene'
        ? body.cast.locationId
        : body.cast.kind === 'picture'
          ? body.cast.entityId
          : body.cast.kind === 'battlefield'
            ? body.cast.focus
            : null;
    if (named !== null && !state.entities.has(entityIdSchema.parse(named))) {
      return sendError(reply, request, 'NOT_FOUND');
    }
    const revision = await displays.writeCast(path.campaignId, body.cast, now());
    const response: CastResponse = { cast: body.cast, revision };
    return reply.send(response);
  });

  app.get('/campaigns/:campaignId/display/join', async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const state = await member(request, reply, actor, path.campaignId, false);
    if (!state) return reply;
    // The DM and the table's display show the code; a player has no use for it here.
    const role = campaignRole(state, actor);
    if (role !== 'DM' && role !== 'DISPLAY') return sendError(reply, request, 'FORBIDDEN');
    const open = await deps.openLinks.current(path.campaignId, displays, now());
    const response: DisplayJoinResponse = open
      ? { link: open.link, code: open.code, expiresAt: open.expiresAt }
      : { link: null, code: null, expiresAt: null };
    return reply.send(response);
  });
}
