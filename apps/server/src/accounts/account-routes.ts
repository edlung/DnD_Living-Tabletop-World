import {
  ACCOUNT_COOKIE,
  MAX_TEMPLATE_CAMPAIGNS,
  campaignIdSchema,
  changePasswordRequestSchema,
  claimRequestSchema,
  createCampaignRequestSchema,
  renameRequestSchema,
  resetRequestSchema,
  signInRequestSchema,
  type AccountResponse,
  type EnteredCampaignResponse,
} from '@ltw/contracts';
import { campaignRole, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { iso } from '../auth/session-authenticator.ts';
import { SESSION_MS, type SignInDependencies } from '../auth/sign-in.ts';
import {
  credentialCookie,
  hashToken,
  secureCookies,
  sessionCookie,
  sessionTokenFrom,
} from '../auth/tokens.ts';
import type { Authenticator } from '../http/auth.ts';
import { errorBody, sendError } from '../http/errors.ts';
import { credentialsOf } from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import type { AccountLimits } from './account-limits.ts';
import type { AccountStore } from './account-store.ts';
import type { AdventurePictures } from '../adventures/adventures.ts';
import type { AssetContentStore } from '../assets/content-store.ts';
import type { LibraryStore } from '../library/library-store.ts';
import type { Logger } from '../platform/logging/logger.ts';
import {
  ACCOUNT_SESSION_MS,
  accountOf,
  campaignsOf,
  checkPassword,
  enterSeat,
  newAccountRecord,
  openAccountSession,
} from './accounts.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import { createFromTemplate } from './templates.ts';

/**
 * Accounts over HTTP (docs/adr/0041-accounts.md), invitation mode only: signing in and out,
 * claiming a live seat for a new account, a reset, the hub's account with its campaigns, opening
 * a campaign (a campaign session for the seat) and creating one from a ready adventure. Failed
 * sign-ins answer the same 401; nothing here ever returns a password, a hash, a token or a cookie.
 */
export interface AccountRouteDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  readonly signIn: SignInDependencies & {
    readonly accounts: AccountStore;
    readonly accountLimits: AccountLimits;
  };
  /** The DM's library, where a ready adventure's handouts and tables are copied (ADR 0058 §5). */
  readonly dm?: { readonly library: LibraryStore };
  /** A ready adventure's curated pictures and where their bytes go (ADR 0035 §3). */
  readonly adventurePictures?: AdventurePictures;
  readonly assets?: { readonly contents: AssetContentStore };
  readonly logger?: Logger;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const emptyBody = z.object({}).strict().optional();

/**
 * A 409 whose reason the page words: a taken login, a seat the account already has, a seat that
 * has a login already, the campaign limit, or a login that also plays at other DMs' tables.
 */
export const conflict = (
  reply: FastifyReply,
  request: FastifyRequest,
  reason: 'login-taken' | 'already-seated' | 'has-account' | 'campaign-limit' | 'other-tables',
) => reply.code(409).send({ ...errorBody('CONFLICT', request.id), reason });

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRouteDependencies): void {
  const { accounts, accountLimits, credentials, clock } = deps.signIn;
  const secure = secureCookies(deps.signIn.publicOrigin);
  const accountCookie = (token: string) =>
    credentialCookie(ACCOUNT_COOKIE, token, ACCOUNT_SESSION_MS / 1000, secure);
  const signedIn = (request: FastifyRequest) => accountOf(deps.signIn, request.headers.cookie);

  /** Sets the campaign session, revoking the one this browser held before. */
  const withCampaignSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
    token: string,
  ) => {
    const previous = sessionTokenFrom(request.headers.cookie);
    if (previous !== null) await credentials.revokeSession(hashToken(previous), iso(clock.now()));
    reply.header('set-cookie', sessionCookie(token, SESSION_MS / 1000, secure));
  };

  app.post('/auth/sign-in', async (request, reply) => {
    const body = signInRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const { login, password } = body.data;
    if (!accountLimits.signIn(clientGroup(request.ip), login)) {
      request.log.info({ limit: 'sign-in' }, 'request limited');
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const account = await checkPassword(accounts, login, password);
    if (!account) {
      accountLimits.failed(login);
      request.log.info('account sign-in refused');
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    const token = await openAccountSession(deps.signIn, account.accountId);
    request.log.info({ accountId: account.accountId }, 'account signed in');
    return reply
      .header('set-cookie', accountCookie(token))
      .send({ login: account.login, displayName: account.displayName });
  });

  app.post('/auth/account/sign-out', async (request, reply) => {
    if (!emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    await accounts.revokeSession(current.sessionTokenHash, iso(clock.now()));
    // The campaign session this browser holds goes with it.
    const campaign = sessionTokenFrom(request.headers.cookie);
    if (campaign !== null) await credentials.revokeSession(hashToken(campaign), iso(clock.now()));
    request.log.info({ accountId: current.account.accountId }, 'account signed out');
    return reply.code(204).send();
  });

  // A live invitation session becomes a new account's seat: returning from any device.
  app.post('/auth/claim', async (request, reply) => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    const token = sessionTokenFrom(request.headers.cookie);
    if (!principal || principal.campaignId === null || token === null) {
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    const body = claimRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const state = (await deps.engine.load(principal.campaignId))?.state ?? null;
    const role = campaignRole(state, principal.actor);
    const session = await credentials.findSession(hashToken(token));
    if (role === null || !session) return sendError(reply, request, 'UNAUTHENTICATED');
    if (await accounts.seatOfActor(principal.campaignId, principal.actor.actorId)) {
      return conflict(reply, request, 'has-account');
    }
    if (!accountLimits.account(clientGroup(request.ip))) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const record = await newAccountRecord(body.data, clock.now());
    if (!(await accounts.createAccount(record))) return conflict(reply, request, 'login-taken');
    const seated = await accounts.addSeat({
      accountId: record.accountId,
      campaignId: principal.campaignId,
      actorId: principal.actor.actorId,
      role: role === 'DM' ? 'dm' : 'player',
      invitationId: session.invitationId,
      joinedAt: iso(clock.now()),
    });
    if (!seated) return conflict(reply, request, 'has-account');
    const accountToken = await openAccountSession(deps.signIn, record.accountId);
    request.log.info({ accountId: record.accountId }, 'seat claimed by a new account');
    return reply
      .code(201)
      .header('set-cookie', accountCookie(accountToken))
      .send({ login: record.login, displayName: record.displayName });
  });

  /**
   * A new password ends the campaign sessions of every seat too (ADR 0041 §7): a session opened
   * with the old password elsewhere, or a seat's browser session, signs in again.
   */
  const signOutSeats = async (accountId: string, now: string) => {
    for (const seat of await accounts.seats(accountId)) {
      await credentials.revokeActorSessions(seat.campaignId, seat.actorId, now);
    }
  };

  app.post('/auth/reset', async (request, reply) => {
    const body = resetRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    if (!accountLimits.signIn(clientGroup(request.ip), 'reset')) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const now = iso(clock.now());
    const accountId = await accounts.useReset(hashToken(body.data.token), now);
    if (accountId === null) return sendError(reply, request, 'UNAUTHENTICATED');
    await accounts.setPassword(accountId, await hashPassword(body.data.password), now);
    await accounts.revokeSessions(accountId, now);
    await signOutSeats(accountId, now);
    request.log.info({ accountId }, 'password reset');
    return reply.code(204).send();
  });

  app.get('/account', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const { account } = current;
    const response: AccountResponse = {
      login: account.login,
      displayName: account.displayName,
      campaigns: await campaignsOf(deps.engine, await accounts.seats(account.accountId)),
    };
    return reply.send(response);
  });

  app.post('/account/password', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const body = changePasswordRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const { account } = current;
    if (!accountLimits.signIn(clientGroup(request.ip), account.login)) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    if (!(await verifyPassword(body.data.current, account.passwordHash))) {
      accountLimits.failed(account.login);
      return sendError(reply, request, 'FORBIDDEN');
    }
    const now = iso(clock.now());
    await accounts.setPassword(account.accountId, await hashPassword(body.data.next), now);
    // Every other device signs in again; this one stays signed in to the account.
    await accounts.revokeSessions(account.accountId, now, current.sessionTokenHash);
    await signOutSeats(account.accountId, now);
    return reply.code(204).send();
  });

  app.post('/account/name', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const body = renameRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    await accounts.setDisplayName(current.account.accountId, body.data.displayName);
    return reply.code(204).send();
  });

  app.post('/account/campaigns/:campaignId/enter', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const path = params.safeParse(request.params);
    if (!path.success || !emptyBody.safeParse(request.body).success) {
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    const seat = (await accounts.seats(current.account.accountId)).find(
      (entry) => entry.campaignId === path.data.campaignId,
    );
    // A campaign the account has no live seat in is the same 404 as one that does not exist.
    const token = seat ? await enterSeat(deps.engine, deps.signIn, seat) : null;
    if (!seat || token === null) return sendError(reply, request, 'NOT_FOUND');
    await withCampaignSession(request, reply, token);
    const response: EnteredCampaignResponse = { campaignId: seat.campaignId, role: seat.role };
    return reply.send(response);
  });

  app.post('/account/campaigns', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const body = createCampaignRequestSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const { accountId } = current.account;
    const dmSeats = (await accounts.seats(accountId)).filter((seat) => seat.role === 'dm');
    if (dmSeats.length >= MAX_TEMPLATE_CAMPAIGNS) return conflict(reply, request, 'campaign-limit');
    if (!accountLimits.campaign(accountId)) return sendError(reply, request, 'RATE_LIMITED');
    const { adventurePictures, assets, logger } = deps;
    const created = await createFromTemplate(
      deps.engine,
      {
        ...deps.signIn,
        ...(deps.dm ? { library: deps.dm.library } : {}),
        ...(adventurePictures && assets && logger
          ? { pictures: { sets: adventurePictures, contents: assets.contents, logger } }
          : {}),
      },
      accountId,
      body.data.template,
    );
    await withCampaignSession(request, reply, created.sessionToken);
    request.log.info({ accountId, campaignId: created.campaignId }, 'campaign created');
    const response: EnteredCampaignResponse = { campaignId: created.campaignId, role: 'dm' };
    return reply.code(201).send(response);
  });
}
