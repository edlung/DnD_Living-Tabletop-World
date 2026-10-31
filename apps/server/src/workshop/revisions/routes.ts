import {
  adoptCampaignEditSchema,
  restoreCampaignRevisionSchema,
  replaceDraftLocksSchema,
  workshopIdSchema,
  type CampaignRevisionConflictView,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import { MAX_CAMPAIGN_PACKAGE_BYTES } from '../packages/content.ts';
import { assessCampaignRevision } from '../packages/compiler.ts';
import type { WorkshopDependencies } from '../service.ts';
import { loadCampaignEditingContext } from './context.ts';
import { buildCampaignRevisionReview } from './review.ts';
import type { ControlledRevisionResult, RevisionControlConflict } from './store.ts';

const empty = z.object({}).strict();
const number = z
  .string()
  .regex(/^[1-9][0-9]{0,6}$/)
  .transform(Number)
  .pipe(z.number().max(1_000_000));
const draftPath = z.object({ draftId: workshopIdSchema }).strict();
const revisionPath = draftPath.extend({ revision: number }).strict();
const jobPath = draftPath.extend({ jobId: workshopIdSchema }).strict();
const editingQuery = z.object({ revision: number.optional() }).strict();
const compareQuery = z.object({ from: number, to: number }).strict();

function conflict(
  reply: FastifyReply,
  reason: RevisionControlConflict,
  conflicts?: Extract<ControlledRevisionResult, { kind: 'conflict' }>['conflicts'],
) {
  return reply.code(409).send({
    conflict: { reason, ...(conflicts ? { conflicts: [...conflicts] } : {}) },
  } satisfies CampaignRevisionConflictView);
}
async function saved(
  reply: FastifyReply,
  request: FastifyRequest,
  result: ControlledRevisionResult,
  ownerId: string,
) {
  if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
  if (result.kind === 'conflict') return conflict(reply, result.reason, result.conflicts);
  return reply.send({
    revision: result.revision,
    assessment: await assessCampaignRevision(result.revision, ownerId),
  });
}

/** Private owner authoring only. No canonical command, provider or campaign credential path. */
export function registerCampaignRevisionControlRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
): void {
  const packages = deps.packages,
    controls = deps.revisionControls,
    images = deps.images?.repository;
  if (!packages || !controls || !images) return;
  const owned = async (
    ownerId: string,
    draftId: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (await deps.store.draft(ownerId, draftId)) return true;
    sendError(reply, request, 'NOT_FOUND');
    return false;
  };
  const limited = async (
    ownerId: string,
    request: FastifyRequest,
    reply: FastifyReply,
    run: () => Promise<FastifyReply>,
  ) => {
    const slot = deps.limits.expensive(`workshop:${ownerId}`);
    if (!slot) return sendError(reply, request, 'RATE_LIMITED');
    try {
      return await run();
    } finally {
      slot.release();
    }
  };
  app.get('/workshop/drafts/:draftId/editing', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params),
      query = editingQuery.safeParse(request.query);
    if (!path.success || !query.success) return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
    return limited(session.ownerId, request, reply, async () => {
      const context = await loadCampaignEditingContext(
        deps,
        { ownerId: session.ownerId, draftId: path.data.draftId },
        query.data.revision,
      );
      return context ? reply.send(context) : sendError(reply, request, 'NOT_FOUND');
    });
  });
  app.post(
    '/workshop/drafts/:draftId/locks',
    { bodyLimit: MAX_CAMPAIGN_PACKAGE_BYTES + 16 * 1024 },
    async (request, reply) => {
      const session = await authorizeWorkshop(request, reply, deps);
      if (!session) return reply;
      const path = draftPath.safeParse(request.params),
        body = replaceDraftLocksSchema.safeParse(request.body);
      if (!path.success || !body.success || !empty.safeParse(request.query).success)
        return sendError(reply, request, 'INVALID_REQUEST');
      if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
      const result = await controls.replaceLocks({
        ...body.data,
        ownerId: session.ownerId,
        draftId: path.data.draftId,
        authSessionId: session.sessionId,
      });
      if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
      return result.kind === 'conflict'
        ? conflict(reply, result.reason)
        : reply.send({ locks: result.locks });
    },
  );
  app.get('/workshop/drafts/:draftId/edits/:jobId/review', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = jobPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
    return limited(session.ownerId, request, reply, async () => {
      const scope = {
        ownerId: session.ownerId,
        draftId: path.data.draftId,
        jobId: path.data.jobId,
        mode: 'EDIT' as const,
      };
      const repository = deps.edits?.repository,
        job = await repository?.get(scope);
      if (!repository || !job || job.mode !== 'EDIT') return sendError(reply, request, 'NOT_FOUND');
      const [candidate, baseline, context] = await Promise.all([
        repository.candidate(scope),
        packages.get(scope.ownerId, scope.draftId, job.baseRevision),
        loadCampaignEditingContext(deps, scope),
      ]);
      if (!candidate || !baseline || !context) return sendError(reply, request, 'NOT_FOUND');
      return reply.send(
        await buildCampaignRevisionReview({
          kind: 'EDIT',
          sourceId: job.jobId,
          candidateDigest: candidate.contentDigest,
          head: context.revision,
          after: candidate.content,
          locks: context.locks,
          manifest: context.manifest,
          ownerId: scope.ownerId,
          baseline,
          retainedIdentities: await packages.identityRecords(
            scope.ownerId,
            scope.draftId,
            candidate.content,
          ),
          ...(job.editSpec ? { editSpec: job.editSpec } : {}),
        }),
      );
    });
  });
  app.post('/workshop/drafts/:draftId/edits/:jobId/adopt', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = jobPath.safeParse(request.params),
      body = adoptCampaignEditSchema.safeParse(request.body);
    if (!path.success || !body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
    return limited(session.ownerId, request, reply, async () => {
      const scope = {
        ownerId: session.ownerId,
        draftId: path.data.draftId,
        jobId: path.data.jobId,
        mode: 'EDIT' as const,
      };
      const job = await deps.edits?.repository.get(scope);
      if (!job || job.mode !== 'EDIT') return sendError(reply, request, 'NOT_FOUND');
      return saved(
        reply,
        request,
        await controls.adopt({
          ...body.data,
          ownerId: scope.ownerId,
          draftId: scope.draftId,
          jobId: scope.jobId,
          authSessionId: session.sessionId,
        }),
        session.ownerId,
      );
    });
  });
  app.get('/workshop/drafts/:draftId/compare', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params),
      query = compareQuery.safeParse(request.query);
    if (!path.success || !query.success) return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
    return limited(session.ownerId, request, reply, async () => {
      const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
      const [context, after] = await Promise.all([
        loadCampaignEditingContext(deps, scope, query.data.from),
        packages.get(scope.ownerId, scope.draftId, query.data.to),
      ]);
      if (!context || !after) return sendError(reply, request, 'NOT_FOUND');
      return reply.send(
        await buildCampaignRevisionReview({
          kind: 'COMPARE',
          sourceId: String(after.revision),
          candidateDigest: after.digest,
          head: context.revision,
          after: after.content,
          locks: context.locks,
          manifest: context.manifest,
          ownerId: scope.ownerId,
          baseline: after,
          retainedIdentities: await packages.identityRecords(
            scope.ownerId,
            scope.draftId,
            after.content,
          ),
        }),
      );
    });
  });
  app.get(
    '/workshop/drafts/:draftId/revisions/:revision/restore-review',
    async (request, reply) => {
      const session = await authorizeWorkshop(request, reply, deps);
      if (!session) return reply;
      const path = revisionPath.safeParse(request.params);
      if (!path.success || !empty.safeParse(request.query).success)
        return sendError(reply, request, 'INVALID_REQUEST');
      if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
      return limited(session.ownerId, request, reply, async () => {
        const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
        const [context, historical] = await Promise.all([
          loadCampaignEditingContext(deps, scope),
          packages.get(scope.ownerId, scope.draftId, path.data.revision),
        ]);
        if (!context || !historical) return sendError(reply, request, 'NOT_FOUND');
        return reply.send(
          await buildCampaignRevisionReview({
            kind: 'RESTORE',
            sourceId: String(historical.revision),
            candidateDigest: historical.digest,
            head: context.revision,
            after: historical.content,
            locks: context.locks,
            manifest: context.manifest,
            ownerId: scope.ownerId,
            baseline: historical,
            retainedIdentities: await packages.identityRecords(
              scope.ownerId,
              scope.draftId,
              historical.content,
            ),
          }),
        );
      });
    },
  );
  app.post('/workshop/drafts/:draftId/revisions/:revision/restore', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = revisionPath.safeParse(request.params),
      body = restoreCampaignRevisionSchema.safeParse(request.body);
    if (!path.success || !body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    if (!(await owned(session.ownerId, path.data.draftId, request, reply))) return reply;
    return limited(session.ownerId, request, reply, async () =>
      saved(
        reply,
        request,
        await controls.restore({
          ...body.data,
          ownerId: session.ownerId,
          draftId: path.data.draftId,
          authSessionId: session.sessionId,
          restoreRevision: path.data.revision,
        }),
        session.ownerId,
      ),
    );
  });
}
