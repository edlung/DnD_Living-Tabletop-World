import { redeemRequestSchema, type AuthSessionResponse, type RedeemResponse } from '@ltw/contracts';
import { campaignRole, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Authenticator } from '../http/auth.ts';
import { sendError } from '../http/errors.ts';
import { credentialsOf } from '../http/request-context.ts';
import type { RedeemAttempt } from './credential-store.ts';
import { iso } from './session-authenticator.ts';
import { SESSION_MS, redeemInvitation, type SignInDependencies } from './sign-in.ts';
import {
  clearedSessionCookie,
  hashToken,
  secureCookies,
  sessionCookie,
  sessionTokenFrom,
  tokenPrefix,
} from './tokens.ts';

/**
 * Sign-in routes (docs/adr/0036-production-sign-in.md §2–3; docs/STAGE_340_DESIGN.md "Flows"):
 * `POST /auth/redeem`, `GET /auth/session`, `POST /auth/sign-out`. Every failed redeem answers
 * the same fixed 401, whatever the reason; limits answer the fixed 429. Logs carry outcomes
 * and invitation IDs, never a token, a hash, a cookie or an address.
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
  const signedOut = (request: FastifyRequest, reply: FastifyReply) =>
    sendError(reply.header('set-cookie', clearedSessionCookie(secure)), request, 'UNAUTHENTICATED');

  const record = async (
    request: FastifyRequest,
    outcome: RedeemAttempt['outcome'],
    prefix: string | null,
  ) => {
    try {
      await credentials.recordAttempt({
        at: iso(clock.now()),
        outcome,
        sourceKey: evidence(request.ip),
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
    if (!limits.redeemAttempt(request.ip)) {
      if (limits.limitedEvidence(request.ip)) await record(request, 'limited', null);
      request.log.info({ limit: 'redeem' }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const body = redeemRequestSchema.safeParse(request.body);
    if (!body.success) {
      limits.redeemFailed(request.ip, null);
      await record(request, 'refused', null);
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const prefix = tokenPrefix(body.data.token);
    if (!limits.prefixAllowed(prefix)) {
      if (limits.limitedEvidence(request.ip)) await record(request, 'limited', prefix);
      request.log.info({ limit: 'token' }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const outcome = await redeemInvitation(deps.engine, deps.signIn, body.data.token);
    if (outcome.kind === 'refused') {
      limits.redeemFailed(request.ip, prefix);
      await record(request, 'refused', prefix);
      request.log.info({ reason: outcome.reason }, 'sign-in refused');
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    // One browser, one session: a session this browser held before is revoked.
    const previous = sessionTokenFrom(request.headers.cookie);
    if (previous !== null) await credentials.revokeSession(hashToken(previous), iso(clock.now()));
    await record(request, 'redeemed', prefix);
    request.log.info(
      { invitationId: outcome.invitationId, purpose: outcome.purpose },
      'sign-in redeemed',
    );
    const response: RedeemResponse = { campaignId: outcome.campaignId };
    return reply
      .header('set-cookie', sessionCookie(outcome.sessionToken, SESSION_MS / 1000, secure))
      .send(response);
  });

  app.get('/auth/session', async (request, reply) => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    if (!principal || principal.campaignId === null) return signedOut(request, reply);
    if (!emptyQuery.safeParse(request.query).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    // A session whose actor is no longer a member opens nothing: it is no sign-in either.
    const snapshot = await deps.engine.load(principal.campaignId);
    if (campaignRole(snapshot?.state ?? null, principal.actor) === null) {
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
    await credentials.revokeSession(hashToken(token), iso(clock.now()));
    request.log.info('signed out');
    return reply.header('set-cookie', clearedSessionCookie(secure)).code(204).send();
  });
}
