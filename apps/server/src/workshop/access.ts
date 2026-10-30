import { workshopIdSchema } from '@ltw/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { hashToken } from '../auth/tokens.ts';
import { sendError } from '../http/errors.ts';
import { workshopToken } from './cookies.ts';
import type { WorkshopDependencies } from './service.ts';

export function workshopPrincipal(request: FastifyRequest, deps: WorkshopDependencies) {
  const token = workshopToken(request.headers.cookie);
  return token === null
    ? Promise.resolve(null)
    : deps.store.session(hashToken(token), new Date(deps.clock.now()).toISOString());
}
export function workshopSignedOut(request: FastifyRequest, reply: FastifyReply) {
  // An old response can arrive after another tab redeemed a newer cookie. Never expire that
  // newer credential through a rejected request. Sign-out revokes its server session too.
  return sendError(reply, request, 'UNAUTHENTICATED');
}

/** Authenticate then bind an optional mounted owner, before validating private-resource input. */
export async function authorizeWorkshop(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: WorkshopDependencies,
) {
  const session = await workshopPrincipal(request, deps);
  if (!session) {
    workshopSignedOut(request, reply);
    return null;
  }
  const expected = request.headers['x-workshop-owner'];
  if (expected !== undefined) {
    const parsed = workshopIdSchema.safeParse(expected);
    if (!parsed.success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    if (parsed.data !== session.ownerId) {
      sendError(reply, request, 'CONFLICT');
      return null;
    }
  }
  return session;
}
