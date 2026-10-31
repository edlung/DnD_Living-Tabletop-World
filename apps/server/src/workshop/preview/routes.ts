import {
  campaignPreviewQuerySchema,
  campaignPreviewRevisionQuerySchema,
  campaignPreviewScopeQuerySchema,
  contentHashSchema,
  workshopIdSchema,
  type CampaignPreviewQuery,
  type CampaignPreviewScopeQuery,
  type CampaignPreviewView,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import type { DraftImageRepository } from '../images/store.ts';
import type { CampaignRevisionRepository } from '../packages/store.ts';
import type { WorkshopDependencies } from '../service.ts';
import { previewArt } from './art.ts';
import { PreviewMaterializer } from './materializer.ts';
import {
  previewCatalog,
  previewContext,
  projectPreview,
  projectPreviewEntity,
  projectPreviewInventory,
  projectPreviewSheet,
} from './projection.ts';

const draftPath = z.object({ draftId: workshopIdSchema }).strict();
const entityPath = draftPath.extend({ entityId: workshopIdSchema }).strict();
const contentPath = draftPath.extend({ contentHash: contentHashSchema }).strict();

export function registerCampaignPreviewRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  packages: CampaignRevisionRepository,
  images?: DraftImageRepository,
): void {
  const worlds = new PreviewMaterializer();
  const revisionFor = async <P extends { draftId: string }, Q extends { revision: number }>(
    request: FastifyRequest,
    reply: FastifyReply,
    pathSchema: z.ZodType<P>,
    querySchema: z.ZodType<Q>,
  ) => {
    reply.header('cache-control', 'private, no-store');
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return null;
    const path = pathSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!path.success || !query.success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    if (!(await deps.store.draft(session.ownerId, path.data.draftId))) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    const revision = await packages.get(session.ownerId, path.data.draftId, query.data.revision);
    if (!revision) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { session, revision, params: path.data, query: query.data };
  };
  const projected = async <P extends { draftId: string }, Q extends CampaignPreviewScopeQuery>(
    request: FastifyRequest,
    reply: FastifyReply,
    pathSchema: z.ZodType<P>,
    querySchema: z.ZodType<Q>,
  ) => {
    const ready = await revisionFor(request, reply, pathSchema, querySchema);
    if (!ready) return null;
    const { revision, session, query } = ready;
    const fullQuery: CampaignPreviewQuery = query;
    const [materialized, manifest] = await Promise.all([
      worlds.load(revision, session.ownerId, fullQuery.encounterId ?? null),
      images?.manifest(
        { ownerId: session.ownerId, draftId: revision.draftId },
        revision.revision,
      ) ?? null,
    ]);
    const context = previewContext(revision, session.ownerId, query, materialized, manifest);
    return { ...ready, materialized, manifest, context };
  };

  app.get('/workshop/drafts/:draftId/preview/catalog', async (request, reply) => {
    const ready = await revisionFor(request, reply, draftPath, campaignPreviewRevisionQuerySchema);
    return ready ? reply.send(previewCatalog(ready.revision)) : reply;
  });

  app.get('/workshop/drafts/:draftId/preview', async (request, reply) => {
    const ready = await projected(request, reply, draftPath, campaignPreviewQuerySchema);
    if (!ready) return reply;
    if (!ready.context) {
      if (
        ready.query.perspective === 'OWNER' &&
        ready.materialized.assessment.readiness === 'INVALID'
      ) {
        const { revision } = ready;
        return reply.send({
          revision: revision.revision,
          language: revision.content.world.language,
          campaignName: revision.content.world.name,
          worldName: revision.content.world.worldName,
          perspective: { kind: 'OWNER' },
          manifestDigest: previewArt(revision, null, null, null).digest,
          directory: [],
          locations: [],
          scene: null,
          prepared: null,
          assessment: ready.materialized.assessment,
        } satisfies CampaignPreviewView);
      }
      return sendError(
        reply,
        request,
        ready.materialized.assessment.readiness === 'INVALID' ? 'UNPROCESSABLE' : 'NOT_FOUND',
      );
    }
    const view = projectPreview(ready.context, ready.query);
    return view ? reply.send(view) : sendError(reply, request, 'NOT_FOUND');
  });

  app.get('/workshop/drafts/:draftId/preview/entities/:entityId', async (request, reply) => {
    const ready = await projected(request, reply, entityPath, campaignPreviewScopeQuerySchema);
    if (!ready) return reply;
    const view = ready.context ? projectPreviewEntity(ready.context, ready.params.entityId) : null;
    return view ? reply.send(view) : sendError(reply, request, 'NOT_FOUND');
  });

  app.get('/workshop/drafts/:draftId/preview/entities/:entityId/sheet', async (request, reply) => {
    const ready = await projected(request, reply, entityPath, campaignPreviewScopeQuerySchema);
    if (!ready) return reply;
    const view = ready.context ? projectPreviewSheet(ready.context, ready.params.entityId) : null;
    return view ? reply.send(view) : sendError(reply, request, 'NOT_FOUND');
  });

  app.get(
    '/workshop/drafts/:draftId/preview/entities/:entityId/inventory',
    async (request, reply) => {
      const ready = await projected(request, reply, entityPath, campaignPreviewScopeQuerySchema);
      if (!ready) return reply;
      const view = ready.context
        ? projectPreviewInventory(ready.context, ready.params.entityId)
        : null;
      return view ? reply.send(view) : sendError(reply, request, 'NOT_FOUND');
    },
  );

  app.get('/workshop/drafts/:draftId/preview/content/:contentHash', async (request, reply) => {
    const ready = await projected(request, reply, contentPath, campaignPreviewScopeQuerySchema);
    if (!ready) return reply;
    if (!ready.context?.art.hashes.has(ready.params.contentHash) || !images)
      return sendError(reply, request, 'NOT_FOUND');
    const content = await images.content(
      { ownerId: ready.session.ownerId, draftId: ready.revision.draftId },
      ready.params.contentHash,
    );
    return content
      ? reply.type(content.mediaType).send(Buffer.from(content.bytes))
      : sendError(reply, request, 'NOT_FOUND');
  });
}
