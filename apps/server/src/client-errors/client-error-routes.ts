import {
  campaignIdSchema,
  clientErrorReportSchema,
  type ClientErrorRole,
  type ClientErrorView,
  type ClientErrorsResponse,
} from '@ltw/contracts';
import { campaignRole } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { actorFor } from '../http/auth.ts';
import { sendError } from '../http/errors.ts';
import {
  authenticate,
  credentialsOf,
  parseInput,
  type RouteDependencies,
} from '../http/request-context.ts';
import { clientGroup } from '../platform/net/addresses.ts';
import {
  InMemoryClientErrorStore,
  type ClientErrorRecord,
  type ClientErrorStore,
} from './client-error-store.ts';

/**
 * Client error reports over HTTP (docs/adr/0073-table-ideas.md §1).
 * - `POST /client-errors`: anyone who can load the page sends one — a page can break before
 *   sign-in, and a table display sends one too (its one write). Limited by the sender's address
 *   group and as a whole. A campaign is believed only for a member of it, from the sender's own
 *   credential; anyone else's report is kept without a campaign.
 * - `GET /campaigns/:campaignId/client-errors`, `POST …/client-errors/clear`: the campaign's DM,
 *   in the DM routes' order (401, 400, 404 for anyone but this campaign's DM).
 * A report holds enumerations, numbers and script file names only; nothing of it is echoed.
 */
export interface ClientErrorDependencies {
  readonly store: ClientErrorStore;
  readonly now: () => string;
  /** The server's build (`LTW_REVISION`), stamped on every report. */
  readonly build: string;
}

export const memoryClientErrors = (): ClientErrorDependencies => ({
  store: new InMemoryClientErrorStore(),
  now: () => new Date().toISOString(),
  build: 'unknown',
});

/** The build as a report may carry it: the revision's safe characters, or `unknown`. */
export function buildLabel(revision: string | undefined): string {
  const label = (revision ?? '').trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(label) ? label : 'unknown';
}

export interface ClientErrorRouteDependencies extends RouteDependencies {
  readonly clientErrors: ClientErrorDependencies;
}

/** One screen in a loop sends five a page load at most; a table of eight shares an address. */
export const REPORTS_PER_ADDRESS = 30;
/** Every sender together: a storm leaves the server and its log alone. */
export const REPORTS_PER_MINUTE = 120;
/** A report is a few hundred bytes. */
const BODY_LIMIT = 2048;

const params = z.object({ campaignId: campaignIdSchema }).strict();

const ROLES: Readonly<Record<string, ClientErrorRole>> = {
  DM: 'dm',
  PLAYER: 'player',
  DISPLAY: 'display',
};

const viewOf = (record: ClientErrorRecord, role: ClientErrorRole): ClientErrorView => ({
  errorId: record.fingerprint,
  kind: record.kind,
  name: record.name,
  page: record.page,
  part: record.part,
  role,
  browser: record.browser,
  browserVersion: record.browserVersion,
  system: record.system,
  shell: record.shell,
  place: record.place,
  build: record.build,
  count: record.count,
  firstAt: record.firstAt,
  lastAt: record.lastAt,
});

export function registerClientErrorRoutes(
  app: FastifyInstance,
  deps: ClientErrorRouteDependencies,
): void {
  const { store, now, build } = deps.clientErrors;
  const perAddress = new WindowCounter({
    limit: REPORTS_PER_ADDRESS,
    windowMs: 60_000,
    maxKeys: 10_000,
  });
  const everyone = new WindowCounter({ limit: REPORTS_PER_MINUTE, windowMs: 60_000, maxKeys: 1 });

  /** The sender's campaign and role there, from their own credential; none for anyone else. */
  const placeOf = async (
    request: FastifyRequest,
    claimed: string | undefined,
  ): Promise<{ campaignId: string; role: ClientErrorRole } | null> => {
    const principal = await deps.authenticator.authenticate(credentialsOf(request));
    if (!principal) return null;
    const campaignId = claimed ?? principal.campaignId;
    if (campaignId === null) return null;
    const state = (await deps.engine.load(campaignId))?.state ?? null;
    const role = ROLES[campaignRole(state, actorFor(principal, campaignId)) ?? ''];
    return role === undefined ? null : { campaignId, role };
  };

  app.post('/client-errors', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const at = Date.now();
    // Counted before anything is read: an address over its limit costs nothing more.
    if (
      perAddress.take(clientGroup(request.ip), at) !== 'taken' ||
      everyone.take('all', at) !== 'taken'
    ) {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const report = parseInput(clientErrorReportSchema, request.body, request, reply);
    if (!report) return reply;
    const { campaignId: claimed, ...fields } = report;
    const place = await placeOf(request, claimed);
    const record = {
      ...fields,
      campaignId: place?.campaignId ?? null,
      role: place?.role ?? ('nobody' as const),
      build,
    };
    await store.record(record, now());
    // The log says that one came, not what it held: the table is the one copy, removed on time.
    request.log.info({ role: record.role, kind: record.kind }, 'client error reported');
    return reply.code(204).send();
  });

  /** The DM's own campaign, or null after sending 401/400/404. */
  const asDm = async (request: FastifyRequest, reply: FastifyReply): Promise<string | null> => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return null;
    const state = (await deps.engine.load(path.campaignId))?.state ?? null;
    if (campaignRole(state, actor) !== 'DM') {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return path.campaignId;
  };

  app.get('/campaigns/:campaignId/client-errors', async (request, reply) => {
    const campaignId = await asDm(request, reply);
    if (campaignId === null) return reply;
    const errors = (await store.ofCampaign(campaignId)).flatMap((record) =>
      record.role === 'nobody' ? [] : [viewOf(record, record.role)],
    );
    const body: ClientErrorsResponse = { errors };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/client-errors/clear', async (request, reply) => {
    const campaignId = await asDm(request, reply);
    if (campaignId === null) return reply;
    await store.clear(campaignId);
    return reply.code(204).send();
  });
}
