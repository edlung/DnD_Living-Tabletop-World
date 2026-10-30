import { randomUUID } from 'node:crypto';

import {
  createWorkshopDraftSchema,
  workshopDraftQuerySchema,
  workshopIdSchema,
  workshopRedeemSchema,
  type WorkshopDraftList,
  type WorkshopSessionView,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { hashToken, newToken, secureCookies, tokenPrefix } from '../auth/tokens.ts';
import { sendError } from '../http/errors.ts';
import { fromPublicOrigin } from '../http/security.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import { workshopCookie, workshopCookieValues } from './cookies.ts';
import { authorizeWorkshop, workshopPrincipal, workshopSignedOut } from './access.ts';
import { WORKSHOP_SESSION_MS, type WorkshopDependencies } from './service.ts';
import { registerCampaignPackageRoutes } from './packages/routes.ts';
import { registerCampaignGenerationRoutes } from './generation/routes.ts';

const empty = z.object({}).strict();
const params = z.object({ draftId: workshopIdSchema }).strict();
const PAGE_SIZE = 50;

export function registerWorkshopRoutes(app: FastifyInstance, deps: WorkshopDependencies): void {
  const secure = secureCookies(deps.publicOrigin);
  const now = () => new Date(deps.clock.now()).toISOString();
  const principal = (request: FastifyRequest) => workshopPrincipal(request, deps);
  const signedOut = (request: FastifyRequest, reply: FastifyReply) =>
    workshopSignedOut(request, reply, deps);
  const draftPrincipal = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeWorkshop(request, reply, deps);

  // Scoped hook also protects test compositions without the campaign sign-in plugin.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/workshop/')) return;
    const sensitiveRead = request.routeOptions.url === '/workshop/auth/session';
    if (
      ((request.method !== 'GET' && request.method !== 'HEAD') || sensitiveRead) &&
      !fromPublicOrigin(request, deps.publicOrigin)
    )
      return sendError(reply, request, 'FORBIDDEN');
  });

  app.post('/workshop/auth/redeem', async (request, reply) => {
    const admission = deps.limits.redeemAttempt(clientGroup(request.ip));
    if (typeof admission === 'string') return sendError(reply, request, 'RATE_LIMITED');
    const body = workshopRedeemSchema.safeParse(request.body);
    if (!body.success) {
      admission.failed(null);
      return sendError(reply, request, 'INVALID_REQUEST');
    }
    if (workshopCookieValues(request.headers.cookie).length > 1) {
      admission.failed(null);
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    const current = await principal(request);
    if (current !== null && body.data.replaceSession !== true) {
      admission.settled();
      return sendError(reply, request, 'CONFLICT');
    }
    const prefix = tokenPrefix(body.data.token);
    if (!deps.limits.prefixAllowed(prefix)) return sendError(reply, request, 'RATE_LIMITED');
    const token = newToken();
    const createdAt = now();
    const ownerId = await deps.store.redeem(
      hashToken(body.data.token),
      {
        sessionId: randomUUID(),
        tokenHash: hashToken(token),
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + WORKSHOP_SESSION_MS).toISOString(),
      },
      current?.tokenHash ?? null,
    );
    if (ownerId === null) {
      admission.failed(prefix);
      return sendError(reply, request, 'UNAUTHENTICATED');
    }
    admission.settled();
    return reply
      .header('set-cookie', workshopCookie(token, WORKSHOP_SESSION_MS / 1000, secure))
      .send({ ownerId } satisfies WorkshopSessionView);
  });

  app.get('/workshop/auth/session', async (request, reply) => {
    const session = await principal(request);
    if (!session) return signedOut(request, reply);
    if (!empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return reply.send({ ownerId: session.ownerId } satisfies WorkshopSessionView);
  });

  app.post('/workshop/auth/sign-out', async (request, reply) => {
    const session = await principal(request);
    if (!session) return signedOut(request, reply);
    if (!empty.optional().safeParse(request.body).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    await deps.store.signOut(session.tokenHash, now());
    return reply.header('set-cookie', workshopCookie('', 0, secure)).send({ signedOut: true });
  });

  app.post('/workshop/drafts', async (request, reply) => {
    const session = await draftPrincipal(request, reply);
    if (!session) return reply;
    const body = createWorkshopDraftSchema.safeParse(request.body);
    if (!body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const result = await deps.store.createDraft(session.ownerId, body.data, randomUUID(), now());
    return result.kind === 'conflict'
      ? sendError(reply, request, 'CONFLICT')
      : reply.send(result.draft);
  });

  app.get('/workshop/drafts', async (request, reply) => {
    const session = await draftPrincipal(request, reply);
    if (!session) return reply;
    const query = workshopDraftQuerySchema.safeParse(request.query);
    if (!query.success) return sendError(reply, request, 'INVALID_REQUEST');
    const after =
      query.data.after === undefined
        ? null
        : await deps.store.draft(session.ownerId, query.data.after);
    if (query.data.after !== undefined && !after) return sendError(reply, request, 'NOT_FOUND');
    const drafts = await deps.store.drafts(session.ownerId, after, PAGE_SIZE + 1);
    return reply.send({
      drafts: drafts.slice(0, PAGE_SIZE),
      nextCursor: drafts.length > PAGE_SIZE ? (drafts[PAGE_SIZE - 1]?.draftId ?? null) : null,
    } satisfies WorkshopDraftList);
  });

  app.get('/workshop/drafts/:draftId', async (request, reply) => {
    const session = await draftPrincipal(request, reply);
    if (!session) return reply;
    const path = params.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const draft = await deps.store.draft(session.ownerId, path.data.draftId);
    return draft ? reply.send(draft) : sendError(reply, request, 'NOT_FOUND');
  });

  if (deps.packages) registerCampaignPackageRoutes(app, deps, deps.packages);
  if (deps.generation)
    registerCampaignGenerationRoutes(app, deps, deps.generation, deps.cancelGeneration);
}
