import {
  campaignIdSchema,
  contentHashSchema,
  entityIdSchema,
  type EntityAssetsResponse,
} from '@ltw/contracts';
import { assetContentFor, assetLineage, campaignRole, entityAssetsFor } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AssetContentStore } from '../../assets/content-store.ts';
import { sendError } from '../errors.ts';
import {
  authenticate,
  parseInput,
  withPerspective,
  type RouteDependencies,
} from '../request-context.ts';

/**
 * Asset reads (docs/adr/0022-asset-identity.md §5–§6). The DM reads the
 * whole lineage. A perspective reads the approved assets of an entity it
 * knows or perceives, and their bytes by content hash; anything else is a
 * 404 identical to a nonexistent entity or content. Requests, cancels,
 * retractions, and approvals are commands (`POST /campaigns/:id/commands`).
 */
export interface AssetRouteDependencies extends RouteDependencies {
  readonly assets: { readonly contents: AssetContentStore };
}

/** Content is shown as an image only: never as a document, never with scripts. */
const CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const entityParams = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const contentParams = z
  .object({ campaignId: campaignIdSchema, contentHash: contentHashSchema })
  .strict();
const perspectiveQuery = z.object({ perspective: z.string() }).strict();

export function registerAssetRoutes(app: FastifyInstance, deps: AssetRouteDependencies): void {
  app.get('/campaigns/:campaignId/assets', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(campaignParams, request.params, request, reply);
    if (!params) return reply;
    const state = (await deps.engine.load(params.campaignId))?.state ?? null;
    const role = campaignRole(state, actor);
    if (role === null || state === null) return sendError(reply, request, 'NOT_FOUND');
    if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    return reply.send(assetLineage(state));
  });

  app.get('/campaigns/:campaignId/entities/:entityId/assets', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: entityParams,
      query: perspectiveQuery,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const assets = entityAssetsFor(context.state, context.perspective, params.entityId);
    if (assets === null) return sendError(reply, request, 'NOT_FOUND');
    const body: EntityAssetsResponse = { perspective: context.perspective.label, assets };
    return reply.send(body);
  });

  app.get('/campaigns/:campaignId/assets/content/:contentHash', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, {
      params: contentParams,
      query: perspectiveQuery,
    });
    if (!ready) return reply;
    const { context, params } = ready;
    const shown = assetContentFor(context.state, context.perspective, params.contentHash);
    const content =
      shown === null ? null : await deps.assets.contents.get(params.campaignId, params.contentHash);
    if (content === null) return sendError(reply, request, 'NOT_FOUND');
    return reply
      .header('content-type', content.mediaType)
      .header('content-security-policy', CONTENT_SECURITY_POLICY)
      .header('content-disposition', 'inline')
      .send(Buffer.from(content.bytes));
  });
}
