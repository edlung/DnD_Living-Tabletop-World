import { randomUUID } from 'node:crypto';

import {
  campaignIdSchema,
  createTableLinkRequestSchema,
  tableKeySchema,
  tableSeatRequestSchema,
  type CreatedTableLinkResponse,
  type TableKey,
  type TableLinkStatusResponse,
  type TableOfferResponse,
  type TableSeatResponse,
} from '@ltw/contracts';
import { campaignRole, type WorldState } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { iso } from '../auth/session-authenticator.ts';
import { HOUR_MS, issueInvitation } from '../auth/sign-in.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput } from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import type { DisplayRouteDependencies } from './display-routes.ts';
import { newCode } from './display-routes.ts';
import type { DisplayStore, TableLinkRecord } from './display-store.ts';

/**
 * The table's join link (docs/adr/0042-table-display.md §5): the DM opens it for a few hours; a
 * person with it, or its code, sees the campaign's free seats, picks one, and gets a single-use
 * invitation for that seat at once — redeemed through ADR 0036's path with its checks, its
 * transaction and the account choices of ADR 0041. The link and its code live in this process's
 * memory only, so the table's display can show them; the store keeps their hashes.
 */
export interface OpenLink {
  readonly linkId: string;
  readonly link: string;
  readonly code: string;
  readonly expiresAt: string;
}

export class OpenTableLinks {
  readonly #byCampaign = new Map<string, OpenLink>();

  remember(campaignId: string, link: OpenLink): void {
    this.#byCampaign.set(campaignId, link);
  }

  forget(campaignId: string): void {
    this.#byCampaign.delete(campaignId);
  }

  /** The campaign's open link as remembered, while the store still has it open. */
  async current(campaignId: string, store: DisplayStore, now: string): Promise<OpenLink | null> {
    const remembered = this.#byCampaign.get(campaignId);
    if (!remembered) return null;
    const open = await store.openTableLink(campaignId, now);
    if (open?.linkId !== remembered.linkId) {
      this.#byCampaign.delete(campaignId);
      return null;
    }
    return remembered;
  }
}

/** How long a seat's invitation, minted from the link, waits to be taken. */
const SEAT_INVITATION_HOURS = 1;
const params = z.object({ campaignId: campaignIdSchema }).strict();
const emptyBody = z.object({}).strict();
const offerBody = z.object({ key: tableKeySchema }).strict();

/** The characters nobody plays: what a table link offers. */
const freeSeats = (state: WorldState) =>
  [...state.entities.values()]
    .filter(
      (entity) =>
        entity.kind === 'character' &&
        entity.status !== 'destroyed' &&
        !state.roster.has(entity.entityId),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ entityId, kind, name }) => ({ entityId, kind, name }));

export function registerTableLinkRoutes(
  app: FastifyInstance,
  deps: DisplayRouteDependencies,
): void {
  const { displays, displayLimits, signIn, openLinks } = deps;
  const now = () => iso(signIn.clock.now());

  /** The campaign's DM with the request's body (ADR 0009 order); null once answered. */
  const asDm = async <B>(
    request: FastifyRequest,
    reply: FastifyReply,
    bodySchema: z.ZodType<B>,
  ) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return null;
    const body = parseInput(bodySchema, request.body ?? {}, request, reply);
    if (body === null) return null;
    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (state === null || role === null || role === 'SYSTEM') {
      await sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    if (role !== 'DM') {
      await sendError(reply, request, 'FORBIDDEN');
      return null;
    }
    return { actor, campaignId: path.campaignId, state, body };
  };

  /** The open link a key names, or null after counting the failure (one answer for all). */
  const linkOf = async (
    request: FastifyRequest,
    key: TableKey,
  ): Promise<TableLinkRecord | null> => {
    const client = clientGroup(request.ip);
    const link = await displays.findTableLink(
      'token' in key ? { tokenHash: hashToken(key.token) } : { codeHash: hashToken(key.code) },
    );
    const at = now();
    if (!link || link.closedAt !== null || link.expiresAt <= at) {
      displayLimits.tableFailed(client);
      return null;
    }
    return link;
  };

  app.post('/campaigns/:campaignId/table-link', async (request, reply) => {
    const dm = await asDm(request, reply, createTableLinkRequestSchema);
    if (!dm) return reply;
    const { hours } = dm.body;
    const at = signIn.clock.now();
    await displays.closeTableLinks(dm.campaignId, iso(at));
    const token = newToken();
    const code = newCode();
    const linkId = randomUUID();
    const expiresAt = iso(at + hours * HOUR_MS);
    await displays.createTableLink({
      linkId,
      campaignId: dm.campaignId,
      tokenHash: hashToken(token),
      codeHash: hashToken(code),
      createdBy: dm.actor.actorId,
      createdAt: iso(at),
      expiresAt,
    });
    const link = `${signIn.publicOrigin}/table#${token}`;
    openLinks.remember(dm.campaignId, { linkId, link, code, expiresAt });
    request.log.info({ linkId }, 'table link opened');
    const response: CreatedTableLinkResponse = { link, code, expiresAt };
    return reply.code(201).send(response);
  });

  app.get('/campaigns/:campaignId/table-link', async (request, reply) => {
    const dm = await asDm(request, reply, emptyBody);
    if (!dm) return reply;
    const open = await displays.openTableLink(dm.campaignId, now());
    const seats = open ? await displays.tableSeats(open.linkId) : [];
    const invitations = seats.length
      ? await signIn.credentials.listInvitations(dm.campaignId, 100)
      : [];
    const response: TableLinkStatusResponse = {
      open: open !== null,
      expiresAt: open?.expiresAt ?? null,
      seated: seats.flatMap((seat) => {
        const character = dm.state.entities.get(seat.characterId);
        if (!character) return [];
        const invitation = invitations.find((entry) => entry.invitationId === seat.invitationId);
        return [
          {
            character: { entityId: character.entityId, kind: character.kind, name: character.name },
            at: seat.seatedAt,
            taken: invitation?.usedAt !== null && invitation !== undefined,
          },
        ];
      }),
    };
    return reply.send(response);
  });

  app.post('/campaigns/:campaignId/table-link/close', async (request, reply) => {
    const dm = await asDm(request, reply, emptyBody);
    if (!dm) return reply;
    const closed = await displays.closeTableLinks(dm.campaignId, now());
    openLinks.forget(dm.campaignId);
    return reply.send({ closed });
  });

  app.post('/auth/table/offer', async (request, reply) => {
    const body = parseInput(offerBody, request.body, request, reply);
    if (!body) return reply;
    if (!displayLimits.tableTry(clientGroup(request.ip))) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const link = await linkOf(request, body.key);
    const state = link ? (await deps.engine.load(link.campaignId))?.state : null;
    if (!link || !state?.campaign) return sendError(reply, request, 'UNAUTHENTICATED');
    const response: TableOfferResponse = {
      campaignName: state.campaign.name,
      language: state.campaign.language,
      characters: freeSeats(state),
    };
    return reply.send(response);
  });

  app.post('/auth/table/seat', async (request, reply) => {
    const body = parseInput(tableSeatRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const client = clientGroup(request.ip);
    if (!displayLimits.tableTry(client) || !displayLimits.tableSeat(client)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const link = await linkOf(request, body.key);
    const state = link ? (await deps.engine.load(link.campaignId))?.state : null;
    if (!link || !state) return sendError(reply, request, 'UNAUTHENTICATED');
    if (!freeSeats(state).some((seat) => seat.entityId === body.characterId)) {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'That seat is taken', requestId: request.id },
        reason: 'taken',
      });
    }
    const issued = await issueInvitation(signIn, {
      campaignId: link.campaignId,
      purpose: 'player',
      characterId: body.characterId,
      actorId: null,
      createdBy: `table:${link.linkId}`,
      hours: SEAT_INVITATION_HOURS,
    });
    await displays.addTableSeat({
      linkId: link.linkId,
      invitationId: issued.invitationId,
      characterId: body.characterId,
      seatedAt: now(),
    });
    request.log.info({ linkId: link.linkId }, 'table seat offered');
    const response: TableSeatResponse = { token: issued.link.slice(issued.link.indexOf('#') + 1) };
    return reply.send(response);
  });
}
