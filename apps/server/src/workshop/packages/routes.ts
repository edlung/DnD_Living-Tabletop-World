import {
  saveCampaignRevisionSchema,
  workshopIdSchema,
  type CampaignAssessment,
  type CampaignRevisionView,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import type { WorkshopDependencies } from '../service.ts';
import { assessCampaignRevision } from './compiler.ts';
import { campaignCanonicalJson, MAX_CAMPAIGN_PACKAGE_BYTES } from './content.ts';
import type { CampaignRevisionRepository } from './store.ts';

const empty = z.object({}).strict();
const draftPath = z.object({ draftId: workshopIdSchema }).strict();
const number = z
  .string()
  .regex(/^[1-9][0-9]{0,6}$/)
  .transform(Number)
  .pipe(z.number().max(1_000_000));
const revisionPath = draftPath.extend({ revision: number }).strict();
const historyQuery = z.object({ before: number.optional() }).strict();
const PAGE_SIZE = 25;
const EMPTY_ASSESSMENT: CampaignAssessment = {
  compilerVersion: 1,
  readiness: 'INCOMPLETE',
  findings: [
    {
      severity: 'error',
      code: 'PACKAGE_MISSING',
      path: 'content',
      message: 'Save a campaign package to assess it',
    },
  ],
  counts: { entities: 0, knowledge: 0, encounters: 0, quests: 0 },
};

/** Private authoring only: no live engine, campaign principal, provider or assignment path. */
export function registerCampaignPackageRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  repository: CampaignRevisionRepository,
): void {
  const ownedDraft = async (
    ownerId: string,
    draftId: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (await deps.store.draft(ownerId, draftId)) return true;
    sendError(reply, request, 'NOT_FOUND');
    return false;
  };

  app.post(
    '/workshop/drafts/:draftId/revisions',
    { bodyLimit: MAX_CAMPAIGN_PACKAGE_BYTES + 16 * 1024 },
    async (request, reply) => {
      const session = await authorizeWorkshop(request, reply, deps);
      if (!session) return reply;
      const path = draftPath.safeParse(request.params);
      const body = saveCampaignRevisionSchema.safeParse(request.body);
      if (!path.success || !body.success || !empty.safeParse(request.query).success)
        return sendError(reply, request, 'INVALID_REQUEST');
      if (
        Buffer.byteLength(campaignCanonicalJson(body.data.content), 'utf8') >
        MAX_CAMPAIGN_PACKAGE_BYTES
      )
        return sendError(reply, request, 'INVALID_REQUEST');
      if (!(await ownedDraft(session.ownerId, path.data.draftId, request, reply))) return reply;
      const result = await repository.append({
        ...body.data,
        ownerId: session.ownerId,
        draftId: path.data.draftId,
        source: { kind: 'OWNER', actorId: session.ownerId },
        createdAt: new Date(deps.clock.now()).toISOString(),
      });
      if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
      if (result.kind === 'conflict') return sendError(reply, request, 'CONFLICT');
      return reply.send({
        revision: result.revision,
        assessment: await assessCampaignRevision(result.revision, session.ownerId),
      } satisfies CampaignRevisionView);
    },
  );

  app.get('/workshop/drafts/:draftId/revisions', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params);
    const query = historyQuery.safeParse(request.query);
    if (!path.success || !query.success) return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await ownedDraft(session.ownerId, path.data.draftId, request, reply))) return reply;
    const revisions = await repository.list(
      session.ownerId,
      path.data.draftId,
      query.data.before ?? null,
      PAGE_SIZE + 1,
    );
    return reply.send({
      revisions: revisions.slice(0, PAGE_SIZE),
      nextBefore:
        revisions.length > PAGE_SIZE ? (revisions[PAGE_SIZE - 1]?.revision ?? null) : null,
    });
  });

  app.get('/workshop/drafts/:draftId/revisions/:revision', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = revisionPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await ownedDraft(session.ownerId, path.data.draftId, request, reply))) return reply;
    const revision = await repository.get(session.ownerId, path.data.draftId, path.data.revision);
    if (!revision) return sendError(reply, request, 'NOT_FOUND');
    return reply.send({
      revision,
      assessment: await assessCampaignRevision(revision, session.ownerId),
    } satisfies CampaignRevisionView);
  });

  app.get('/workshop/drafts/:draftId/package', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await ownedDraft(session.ownerId, path.data.draftId, request, reply))) return reply;
    const revision = await repository.latest(session.ownerId, path.data.draftId);
    return reply.send({
      revision,
      assessment: revision
        ? await assessCampaignRevision(revision, session.ownerId)
        : EMPTY_ASSESSMENT,
    } satisfies CampaignRevisionView);
  });
}
