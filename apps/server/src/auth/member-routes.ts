import { randomUUID } from 'node:crypto';

import {
  DEFAULT_INVITATION_HOURS,
  campaignIdSchema,
  createInvitationRequestSchema,
  entityIdSchema,
  invitationIdSchema,
  type CreatedInvitationResponse,
  type InvitationView,
  type MembershipResponse,
  type RevokeInvitationResponse,
  type RevokeMemberResponse,
} from '@ltw/contracts';
import { campaignRole, type Actor, type CampaignSnapshot } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { statusOf } from '../http/command-status.ts';
import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import type { InvitationRecord } from './credential-store.ts';
import { iso } from './session-authenticator.ts';
import { issueInvitation, type SignInDependencies } from './sign-in.ts';

/**
 * The DM's members and invitations (docs/adr/0036-production-sign-in.md §4;
 * docs/STAGE_340_DESIGN.md "Flows", "Revocation"), in the ADR 0009 order: 401, 400, then the
 * 404 of a missing campaign for anyone who is not this campaign's DM. Never a token, a token
 * hash or a player's actor ID in an answer or a log. Membership changes only through the World
 * Engine: an invited player's seat is `AssignCharacter`, a revoked member's `ReleaseCharacter`.
 */
export interface MemberRouteDependencies extends RouteDependencies {
  readonly signIn: SignInDependencies;
}

/** Invitations listed at most, newest first. */
export const LISTED_INVITATIONS = 100;

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const invitationParams = z
  .object({ campaignId: campaignIdSchema, invitationId: invitationIdSchema })
  .strict();
const memberParams = z
  .object({ campaignId: campaignIdSchema, characterId: entityIdSchema })
  .strict();
const emptyBody = z.object({}).strict().optional();
const emptyQuery = z.object({}).strict();

const statusOfInvitation = (record: InvitationRecord, now: number): InvitationView['status'] =>
  record.revokedAt !== null
    ? 'revoked'
    : record.usedAt !== null
      ? 'used'
      : Date.parse(record.expiresAt) <= now
        ? 'expired'
        : 'pending';

const viewOf = (record: InvitationRecord, now: number): InvitationView => ({
  invitationId: record.invitationId,
  purpose: record.purpose,
  characterId: record.characterId,
  status: statusOfInvitation(record, now),
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  usedAt: record.usedAt,
  revokedAt: record.revokedAt,
});

export function registerMemberRoutes(app: FastifyInstance, deps: MemberRouteDependencies): void {
  const { credentials, clock, limits } = deps.signIn;

  /** The DM's own campaign, or null after sending 401/400/404. */
  const asDm = async <P extends { campaignId: string }, B>(
    request: FastifyRequest,
    reply: FastifyReply,
    params: z.ZodType<P>,
    input: z.ZodType<B>,
    source: 'body' | 'query',
  ): Promise<{ actor: Actor; path: P; input: B; snapshot: CampaignSnapshot } | null> => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return null;
    const parsed = input.safeParse(source === 'body' ? request.body : request.query);
    if (!parsed.success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    const snapshot = await deps.engine.load(path.campaignId);
    if (!snapshot || campaignRole(snapshot.state, actor) !== 'DM') {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { actor, path, input: parsed.data, snapshot };
  };

  const isCharacter = (snapshot: CampaignSnapshot, characterId: string) =>
    snapshot.state.entities.get(characterId)?.kind === 'character';

  app.post('/campaigns/:campaignId/invitations', async (request, reply) => {
    const dm = await asDm(request, reply, campaignParams, createInvitationRequestSchema, 'body');
    if (!dm) return reply;
    const { actor, path, input, snapshot } = dm;
    if (!limits.invitation(`${path.campaignId}\n${actor.actorId}`)) {
      request.log.info({ limit: 'invitations' }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    if (!isCharacter(snapshot, input.characterId)) return sendError(reply, request, 'NOT_FOUND');
    // Only an empty seat is offered; a member is revoked first.
    if (snapshot.state.roster.has(input.characterId)) return sendError(reply, request, 'CONFLICT');
    const issued = await issueInvitation(deps.signIn, {
      campaignId: path.campaignId,
      purpose: 'player',
      characterId: input.characterId,
      actorId: null,
      createdBy: actor.actorId,
      hours: input.expiresHours ?? DEFAULT_INVITATION_HOURS,
    });
    request.log.info({ invitationId: issued.invitationId }, 'invitation issued');
    const response: CreatedInvitationResponse = { ...issued, characterId: input.characterId };
    return reply.code(201).send(response);
  });

  app.get('/campaigns/:campaignId/invitations', async (request, reply) => {
    const dm = await asDm(request, reply, campaignParams, emptyQuery, 'query');
    if (!dm) return reply;
    const { path, snapshot } = dm;
    const now = clock.now();
    const invitations = await credentials.listInvitations(path.campaignId, LISTED_INVITATIONS);
    const seats = [...snapshot.state.roster];
    const summaries = await credentials.sessionSummaries(
      path.campaignId,
      seats.map(([, actorId]) => actorId),
      iso(now),
    );
    const response: MembershipResponse = {
      invitations: invitations.map((record) => viewOf(record, now)),
      members: seats.map(([characterId, actorId]) => ({
        characterId,
        activeSessions: summaries.get(actorId)?.active ?? 0,
        lastSeenAt: summaries.get(actorId)?.lastSeenAt ?? null,
      })),
    };
    return reply.send(response);
  });

  app.post('/campaigns/:campaignId/invitations/:invitationId/revoke', async (request, reply) => {
    const dm = await asDm(request, reply, invitationParams, emptyBody, 'body');
    if (!dm) return reply;
    const { path } = dm;
    const outcome = await credentials.revokeInvitation(
      path.campaignId,
      path.invitationId,
      iso(clock.now()),
    );
    // Another campaign's invitation is as missing as one that never existed.
    if (outcome === 'missing') return sendError(reply, request, 'NOT_FOUND');
    if (outcome === 'used') return sendError(reply, request, 'CONFLICT');
    request.log.info({ invitationId: path.invitationId, outcome }, 'invitation revoked');
    const response: RevokeInvitationResponse = { status: 'revoked' };
    return reply.send(response);
  });

  /**
   * Revokes a member: the player's sessions and the character's open invitations first, so
   * the player is out on the next request and the next live cycle whatever happens next, then
   * `ReleaseCharacter` frees the seat for a new invitation.
   */
  app.post('/campaigns/:campaignId/members/:characterId/revoke', async (request, reply) => {
    const dm = await asDm(request, reply, memberParams, emptyBody, 'body');
    if (!dm) return reply;
    const { actor, path, snapshot } = dm;
    if (!isCharacter(snapshot, path.characterId)) return sendError(reply, request, 'NOT_FOUND');
    const now = iso(clock.now());
    const player = snapshot.state.roster.get(path.characterId);
    const sessionsRevoked =
      player === undefined
        ? 0
        : await credentials.revokeActorSessions(path.campaignId, player, now);
    const invitationsRevoked = await credentials.revokeCharacterInvitations(
      path.campaignId,
      path.characterId,
      now,
    );
    let released = false;
    if (player !== undefined) {
      const result = await deps.engine.execute({
        commandId: `release:${randomUUID()}`,
        campaignId: path.campaignId,
        actor,
        command: { type: 'ReleaseCharacter', characterId: path.characterId },
      });
      request.log.info({ status: result.status, sessionsRevoked }, 'member revoked');
      if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
      released = true;
    }
    const response: RevokeMemberResponse = { released, sessionsRevoked, invitationsRevoked };
    return reply.send(response);
  });
}
