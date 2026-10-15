import type { FastifyInstance, FastifyRequest } from 'fastify';

import { sendError } from './errors.ts';

/**
 * Browser-facing protections of the API (docs/adr/0036-production-sign-in.md §7;
 * docs/STAGE_340_DESIGN.md "Request checks", "Browser").
 */

/** The page policy of the design; API responses carry it too (JSON never renders as a page). */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

/** On every response, the live stream included. A route may set a stricter policy of its own. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

/** The live stream: a GET that carries the credential, so cross-site requests are refused too. */
const LIVE_ROUTE = '/campaigns/:campaignId/live';

/**
 * Whether a request needing the origin check came from the public origin. Every non-GET
 * request must carry `Origin` equal to it (browsers send `Origin` on every non-GET fetch).
 * The live stream is a same-origin GET, for which browsers send no `Origin`: it must carry
 * either that `Origin` or, without one, `Sec-Fetch-Site: same-origin` (fetch metadata).
 */
export function fromPublicOrigin(request: FastifyRequest, publicOrigin: string): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined) return origin === publicOrigin;
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return request.headers['sec-fetch-site'] === 'same-origin';
}

export function needsOriginCheck(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return true;
  return request.routeOptions.url === LIVE_ROUTE;
}

/**
 * Invitation mode's CSRF check (ADR 0036, "Cross-site request"): before anything else, a request
 * that changes something, or opens the live stream, from anywhere but the public origin is
 * refused with the fixed 403. It depends on the request alone, never on who or what it names.
 */
export function registerOriginCheck(app: FastifyInstance, publicOrigin: string): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!needsOriginCheck(request) || fromPublicOrigin(request, publicOrigin)) return undefined;
    request.log.info({ check: 'origin' }, 'request refused');
    // Responding early from an async hook: send, then return the reply.
    return sendError(reply, request, 'FORBIDDEN');
  });
}
