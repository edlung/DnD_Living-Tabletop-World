import {
  MAX_TEMPLATE_CAMPAIGNS,
  createLibraryCampaignRequestSchema,
  type CampaignLibraryResponse,
  type EnteredCampaignResponse,
} from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SignInDependencies } from '../auth/sign-in.ts';
import type { CampaignLibrary } from '../campaigns/library.ts';
import { sendError } from '../http/errors.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import type { AccountLimits } from './account-limits.ts';
import { conflict } from './account-routes.ts';
import type { AccountStore } from './account-store.ts';
import { accountOf } from './accounts.ts';
import {
  libraryCreationIds,
  startLibraryCampaign,
  type LibraryCampaignDependencies,
} from './library-campaigns.ts';

/**
 * The campaign library in the hub (docs/adr/0058-campaign-content.md, notes of 2026-11-19): a
 * signed-in account lists it, sees its covers and starts one of its campaigns as its DM, with no
 * workshop invitation. Starting reuses the workshop's activation (`library-campaigns.ts`); the
 * workshop's own routes, its drafts and its paid generation stay the invited owner's.
 */
export interface AccountLibraryDependencies {
  readonly engine: WorldEngine;
  readonly signIn: SignInDependencies & {
    readonly accounts: AccountStore;
    readonly accountLimits: AccountLimits;
  };
  readonly workshop: WorkshopDependencies;
  readonly library: CampaignLibrary;
  /** Sets the campaign session in this browser, revoking the one it held (account-routes.ts). */
  readonly withCampaignSession: (
    request: FastifyRequest,
    reply: FastifyReply,
    token: string,
  ) => Promise<void>;
  /** Overrides for tests: how long one request waits for the activation worker. */
  readonly wait?: Pick<LibraryCampaignDependencies, 'waitMs' | 'pollMs' | 'sleep'>;
}

const empty = z.object({}).strict();
const coverPath = z.object({ libraryId: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/) }).strict();

export function registerAccountLibraryRoutes(
  app: FastifyInstance,
  deps: AccountLibraryDependencies,
): void {
  const { accounts, accountLimits, credentials, clock } = deps.signIn;
  const signedIn = (request: FastifyRequest) => accountOf(deps.signIn, request.headers.cookie);
  /** Requests waiting for a creation of their own, so one account cannot start several at once. */
  const running = new Set<string>();

  app.get('/account/library', async (request, reply) => {
    if (!(await signedIn(request))) return sendError(reply, request, 'UNAUTHENTICATED');
    if (!empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return reply
      .header('cache-control', 'no-store')
      .send({ campaigns: [...deps.library.entries] } satisfies CampaignLibraryResponse);
  });

  app.get('/account/library/:libraryId/cover', async (request, reply) => {
    if (!(await signedIn(request))) return sendError(reply, request, 'UNAUTHENTICATED');
    const path = coverPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const cover = deps.library.cover(path.data.libraryId);
    if (!cover) return sendError(reply, request, 'NOT_FOUND');
    return reply
      .header('cache-control', 'private, max-age=3600')
      .type('image/webp')
      .send(Buffer.from(cover));
  });

  app.post('/account/library-campaigns', async (request, reply) => {
    const current = await signedIn(request);
    if (!current) return sendError(reply, request, 'UNAUTHENTICATED');
    const body = createLibraryCampaignRequestSchema.safeParse(request.body);
    if (!body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const { accountId } = current.account;
    // One creation at a time per account: a second tab waits its turn with a 429.
    if (running.has(accountId)) return sendError(reply, request, 'RATE_LIMITED');
    const dmSeats = (await accounts.seats(accountId)).filter((seat) => seat.role === 'dm');
    if (dmSeats.length >= MAX_TEMPLATE_CAMPAIGNS) return conflict(reply, request, 'campaign-limit');
    // The hourly limit counts a creation once: a repeated request continues it for free.
    const ids = libraryCreationIds(accountId, body.data);
    const known = await deps.workshop.activation?.repository.byRequest(ids.scope, ids.request);
    if (!known && !accountLimits.campaign(accountId))
      return sendError(reply, request, 'RATE_LIMITED');
    running.add(accountId);
    try {
      const result = await startLibraryCampaign(
        {
          engine: deps.engine,
          workshop: deps.workshop,
          library: deps.library,
          accounts,
          credentials,
          clock,
          ...deps.wait,
        },
        { accountId, ...body.data },
      );
      if (result.kind === 'not-found') return await sendError(reply, request, 'NOT_FOUND');
      if (result.kind === 'preparing') return await reply.code(202).send({ preparing: true });
      if (result.kind === 'failed') {
        request.log.warn({ accountId, reason: result.reason }, 'library campaign not started');
        return await sendError(reply, request, 'INTERNAL');
      }
      await deps.withCampaignSession(request, reply, result.sessionToken);
      request.log.info(
        { accountId, campaignId: result.campaignId, library: body.data.libraryId },
        'library campaign created',
      );
      const response: EnteredCampaignResponse = { campaignId: result.campaignId, role: 'dm' };
      return await reply.code(201).send(response);
    } finally {
      running.delete(accountId);
    }
  });
}
