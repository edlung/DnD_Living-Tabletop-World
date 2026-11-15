import { campaignLibraryPackagePathSchema, type CampaignLibraryResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { CampaignLibrary } from '../campaigns/library.ts';
import { sendError } from '../http/errors.ts';
import { authorizeWorkshop } from './access.ts';
import type { WorkshopDependencies } from './service.ts';

const empty = z.object({}).strict();
const coverPath = z.object({ campaignId: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/) }).strict();

/**
 * The campaign library (docs/adr/0058-campaign-content.md, notes of 2026-11-14): a signed-in
 * workshop owner lists it and reads a variant's package, which the workshop then saves into an
 * empty draft through the ordinary revision route. Nothing here writes.
 */
export function registerCampaignLibraryRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  library: CampaignLibrary,
): void {
  app.get('/workshop/library', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    if (!empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return reply.send({ campaigns: [...library.entries] } satisfies CampaignLibraryResponse);
  });

  app.get('/workshop/library/:campaignId/cover', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = coverPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const cover = library.cover(path.data.campaignId);
    if (!cover) return sendError(reply, request, 'NOT_FOUND');
    return reply
      .header('cache-control', 'private, max-age=3600')
      .type('image/webp')
      .send(Buffer.from(cover));
  });

  app.get('/workshop/library/:campaignId/packages/:variantId', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = campaignLibraryPackagePathSchema.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const text = library.packageJson(path.data.campaignId, path.data.variantId);
    if (text === null) return sendError(reply, request, 'NOT_FOUND');
    return reply.header('cache-control', 'no-store').type('application/json').send(text);
  });
}
