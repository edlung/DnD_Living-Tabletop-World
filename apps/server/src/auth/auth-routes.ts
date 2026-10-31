import { redeemRequestSchema, type AuthSessionResponse, type RedeemResponse } from '@ltw/contracts';
import { campaignRole, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Authenticator, Principal } from '../http/auth.ts';
import { sendError } from '../http/errors.ts';
import { credentialsOf } from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import type { EvidenceOutcome } from './limits.ts';
import { iso } from './session-authenticator.ts';
import { SESSION_MS, redeemInvitation, type SignInDependencies } from './sign-in.ts';
import {
  hashToken,
  secureCookies,
  sessionCookie,
  sessionTokenFrom,
  tokenPrefix,
} from './tokens.ts';

/**
 * Sign-in routes (docs/adr/0036-production-sign-in.md §2–3 and its amendment 2026-10-16;
 * docs/STAGE_340_DESIGN.md "Flows"): `POST /auth/redeem`, `GET /auth/session`,
 * `POST /auth/sign-out`. Every failed redeem answers the same fixed 401, whatever the reason;
 * limits answer the fixed 429; a browser already signed in must confirm replacing its session
 * (409 otherwise). Failed reads and logout never expire a cookie: their delayed response could
 * erase a newer campaign credential. Logs carry outcomes/IDs, never credentials or addresses.
 */
export interface AuthRouteDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  readonly signIn: SignInDependencies;
}

const emptyBody = z.object({}).strict().optional();
const emptyQuery = z.object({}).strict();

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDependencies): void {
  const { credentials, clock, limits, evidence } = deps.signIn;
  const secure = secureCookies(deps.signIn.publicOrigin);

  /**
   * A delayed401 cannot know whether another tab has installed a newer credential. Invalid
   * opaque cookies retain no server access and normal redemption replaces them.
   */
  const signedOut = (request: FastifyRequest, reply: FastifyReply) => {
    return sendError(reply, request, 'UNAUTHENTICATED');
  };

  /** Whether a live session's actor still has a role in its campaign: only then is it signed in. */
  const isMember = async (principal: Principal & { readonly campaignId: string }) => {
    const snapshot = await deps.engine.load(principal.campaignId);
    return campaignRole(snapshot?.state ?? null, principal.actor) !== null;
  };

  /** The browser's live sign-in, if any: a live session whose actor is still a member. */
  const signedIn = async (request: FastifyRequest) => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    if (!principal || principal.campaignId === null) return false;
    return isMember({ ...principal, campaignId: principal.campaignId });
  };

  /** Writes one evidence row when the limits' sampling allows it; best effort. */
  const record = async (
    request: FastifyRequest,
    client: string,
    outcome: EvidenceOutcome,
    prefix: string | null,
  ) => {
    if (!limits.evidence(client, outcome)) return;
    try {
      await credentials.recordAttempt({
        at: iso(clock.now()),
        outcome,
        sourceKey: evidence(client),
        prefixKey: prefix === null ? null : evidence(prefix),
      });
    } catch (error) {
      // Evidence is best effort: losing a row never changes an answer.
      request.log.warn(
        { err: error instanceof Error ? error.name : 'unknown' },
        'attempt not recorded',
      );
    }
  };

  app.post('/auth/redeem', async (request, reply) => {
    // `request.ip` is the client behind the trusted proxy (LTW_TRUST_PROXY); an IPv6 /64 is one.
    const client = clientGroup(request.ip);
    const admission = limits.redeemAttempt(client);
    if (typeof admission === 'string') {
      await record(request, client, 'limited', null);
      request.log.info({ limit: 'redeem', reason: admission }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const body = redeemRequestSchema.safeParse(request.body);
    if (!body.success) {
      admission.failed(null);
      await record(request, client, 'refused', null);
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    // One browser, one session: replacing a working sign-in needs the person's confirmation,
    // asked before the invitation is spent (the join page asks, then sends `replaceSession`).
    if (body.data.replaceSession !== true && (await signedIn(request))) {
      admission.settled();
      request.log.info('sign-in needs confirmation to replace a session');
      return sendError(reply, request, 'CONFLICT');
    }
    const prefix = tokenPrefix(body.data.token);
    if (!limits.prefixAllowed(prefix)) {
      await record(request, client, 'limited', prefix);
      request.log.info({ limit: 'token' }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const outcome = await redeemInvitation(deps.engine, deps.signIn, body.data.token);
    if (outcome.kind === 'refused') {
      admission.failed(prefix);
      await record(request, client, 'refused', prefix);
      request.log.info({ reason: outcome.reason }, 'sign-in refused');
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    admission.settled();
    // The session this browser held before, confirmed away or no longer working, is revoked.
    const previous = sessionTokenFrom(request.headers.cookie);
    if (previous !== null) await credentials.revokeSession(hashToken(previous), iso(clock.now()));
    await record(request, client, 'redeemed', prefix);
    request.log.info(
      { invitationId: outcome.invitationId, purpose: outcome.purpose },
      'sign-in redeemed',
    );
    const response: RedeemResponse = { campaignId: outcome.campaignId };
    return reply
      .header('set-cookie', sessionCookie(outcome.sessionToken, SESSION_MS / 1000, secure))
      .send(response);
  });

  // Same-origin only in invitation mode (`http/security.ts`); no credential mutation on reads.
  app.get('/auth/session', async (request, reply) => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    if (!principal || principal.campaignId === null) return signedOut(request, reply);
    if (!emptyQuery.safeParse(request.query).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    // A session whose actor is no longer a member opens nothing: it is no sign-in either.
    if (!(await isMember({ ...principal, campaignId: principal.campaignId }))) {
      return signedOut(request, reply);
    }
    const response: AuthSessionResponse = { campaignId: principal.campaignId };
    return reply.send(response);
  });

  app.post('/auth/sign-out', async (request, reply) => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    const token = sessionTokenFrom(request.headers.cookie);
    if (!principal || token === null) return signedOut(request, reply);
    if (!emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const campaign = request.headers['x-game-campaign'];
    const actor = request.headers['x-game-actor'];
    if (
      (campaign !== undefined && campaign !== principal.campaignId) ||
      (actor !== undefined && actor !== principal.actor.actorId)
    ) {
      return sendError(reply, request, 'CONFLICT');
    }
    await credentials.revokeSession(hashToken(token), iso(clock.now()));
    request.log.info('signed out');
    return reply.code(204).send();
  });
}
