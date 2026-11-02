import {
  ACCOUNT_COOKIE,
  redeemRequestSchema,
  type AuthSessionResponse,
  type RedeemRequest,
  type RedeemResponse,
} from '@ltw/contracts';
import { campaignRole, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Authenticator, Principal } from '../http/auth.ts';
import { sendError } from '../http/errors.ts';
import { credentialsOf } from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import type { EvidenceOutcome } from './limits.ts';
import { iso } from './session-authenticator.ts';
import {
  SESSION_MS,
  redeemInvitation,
  type RedeemOutcome,
  type SignInDependencies,
} from './sign-in.ts';
import { conflict } from '../accounts/account-routes.ts';
import type { AccountRecord } from '../accounts/account-store.ts';
import {
  ACCOUNT_SESSION_MS,
  accountOf,
  newAccountRecord,
  openAccountSession,
} from '../accounts/accounts.ts';
import {
  credentialCookie,
  hashToken,
  secureCookies,
  sessionCookie,
  sessionTokenFrom,
  tokenPrefix,
} from './tokens.ts';

/** The account a redeemed seat joins. */
type SeatAccount =
  | { readonly kind: 'new'; readonly record: AccountRecord }
  | { readonly kind: 'signed-in'; readonly record: AccountRecord };

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

  const accountCookieOf = (token: string) =>
    credentialCookie(ACCOUNT_COOKIE, token, ACCOUNT_SESSION_MS / 1000, secure);

  /**
   * The account a redeem seats (ADR 0041 §4): a new one (its login checked free, its password
   * hashed now), or the one this browser is signed in to; null without accounts. Answers 409 and
   * `answered` when the login is taken or the account already sits in the invitation's campaign.
   */
  const accountForRedeem = async (
    request: FastifyRequest,
    reply: FastifyReply,
    client: string,
    body: RedeemRequest,
  ): Promise<SeatAccount | null | 'answered'> => {
    const { accounts, accountLimits } = deps.signIn;
    if (!accounts || !accountLimits) return null;
    // Only an invitation that would seat someone answers about logins: any other token goes on
    // to the one 401, so a forged token learns nothing about which logins exist.
    const invitation = await credentials.findInvitation(hashToken(body.token));
    const now = iso(clock.now());
    if (
      invitation === null ||
      invitation.usedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt <= now
    ) {
      return null;
    }
    let seat: SeatAccount | null = null;
    if (body.newAccount) {
      if (await accounts.findByLogin(body.newAccount.login)) {
        await conflict(reply, request, 'login-taken');
        return 'answered';
      }
      if (!accountLimits.account(client)) {
        await sendError(reply, request, 'RATE_LIMITED');
        return 'answered';
      }
      seat = { kind: 'new', record: await newAccountRecord(body.newAccount, clock.now()) };
    } else {
      const current = await accountOf({ accounts, clock }, request.headers.cookie);
      if (current) seat = { kind: 'signed-in', record: current.account };
    }
    if (seat === null) return null;
    const seats = seat.kind === 'new' ? [] : await accounts.seats(seat.record.accountId);
    if (seats.some((entry) => entry.campaignId === invitation.campaignId)) {
      await conflict(reply, request, 'already-seated');
      return 'answered';
    }
    return seat;
  };

  /** Adds the redeemed seat to its account; the new account's session token, if one was made. */
  const seatInAccount = async (
    request: FastifyRequest,
    seat: SeatAccount | null,
    outcome: Extract<RedeemOutcome, { kind: 'redeemed' }>,
  ): Promise<string | null> => {
    const { accounts } = deps.signIn;
    if (!accounts || seat === null) return null;
    if (seat.kind === 'new' && !(await accounts.createAccount(seat.record))) {
      // The login was taken meanwhile: the seat keeps its campaign session; the page may claim.
      request.log.info('redeemed without the new account: its login was taken meanwhile');
      return null;
    }
    const added = await accounts.addSeat({
      accountId: seat.record.accountId,
      campaignId: outcome.campaignId,
      actorId: outcome.actorId,
      role: outcome.purpose === 'dm' ? 'dm' : 'player',
      invitationId: outcome.invitationId,
      joinedAt: iso(clock.now()),
    });
    if (!added) request.log.info({ accountId: seat.record.accountId }, 'seat not added to account');
    return seat.kind === 'new'
      ? openAccountSession({ accounts, clock }, seat.record.accountId)
      : null;
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
    // Stage 600 (ADR 0041): the seat joins an account — a new one, or the one signed in. What
    // would refuse it is checked before the invitation is spent.
    const seatAccount = await accountForRedeem(request, reply, client, body.data);
    if (seatAccount === 'answered') return reply;
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
    const cookies = [sessionCookie(outcome.sessionToken, SESSION_MS / 1000, secure)];
    const accountToken = await seatInAccount(request, seatAccount, outcome);
    if (accountToken !== null) cookies.push(accountCookieOf(accountToken));
    return reply.header('set-cookie', cookies.length === 1 ? cookies[0] : cookies).send(response);
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
