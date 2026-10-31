import { contentHashSchema, workshopIdSchema, type CampaignDraftImagesView } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import type { CampaignRevisionRepository } from '../packages/store.ts';
import type { WorkshopDependencies } from '../service.ts';
import type { DraftImageDependencies } from './runtime.ts';
import { draftImageSubjects, imageAvailability, publicDraftImageJob } from './views.ts';

const pathSchema = z.object({ draftId: workshopIdSchema }).strict();
const revision = z.coerce.number().int().min(1).max(1_000_000);
const querySchema = z
  .object({
    revision,
    entityId: workshopIdSchema.optional(),
    jobsBefore: workshopIdSchema.optional(),
    candidatesBefore: workshopIdSchema.optional(),
  })
  .strict();
const contentPath = pathSchema.extend({ contentHash: contentHashSchema }).strict();
const jobPath = pathSchema.extend({ jobId: workshopIdSchema }).strict();
const empty = z.object({}).strict();
const PAGE = 25;

export function registerDraftImageReadRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  packages: CampaignRevisionRepository,
  images: DraftImageDependencies,
): void {
  const { repository, runtime } = images;
  app.get('/workshop/drafts/:draftId/images', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = pathSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (
      !path.success ||
      !query.success ||
      (query.data.entityId === undefined && query.data.candidatesBefore !== undefined)
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
    if (!(await deps.store.draft(scope.ownerId, scope.draftId)))
      return sendError(reply, request, 'NOT_FOUND');
    const [stored, manifest] = await Promise.all([
      packages.get(scope.ownerId, scope.draftId, query.data.revision),
      repository.manifest(scope, query.data.revision),
    ]);
    if (!stored || !manifest) return sendError(reply, request, 'NOT_FOUND');
    const subjects = draftImageSubjects(stored, manifest);
    if (
      query.data.entityId !== undefined &&
      !subjects.some((subject) => subject.entityId === query.data.entityId)
    )
      return sendError(reply, request, 'NOT_FOUND');
    const [jobCursor, candidateCursor] = await Promise.all([
      query.data.jobsBefore ? repository.get({ ...scope, jobId: query.data.jobsBefore }) : null,
      query.data.candidatesBefore ? repository.candidate(scope, query.data.candidatesBefore) : null,
    ]);
    if (
      (query.data.jobsBefore && (!jobCursor || jobCursor.revision !== stored.revision)) ||
      (query.data.candidatesBefore &&
        (!candidateCursor ||
          candidateCursor.sourceRevision !== stored.revision ||
          candidateCursor.entityId !== query.data.entityId))
    )
      return sendError(reply, request, 'NOT_FOUND');
    const [jobs, candidates, availability] = await Promise.all([
      repository.list(scope, stored.revision, PAGE + 1, jobCursor),
      query.data.entityId === undefined
        ? []
        : repository.candidates(
            scope,
            stored.revision,
            PAGE + 1,
            candidateCursor,
            query.data.entityId,
          ),
      imageAvailability(runtime, session.ownerId),
    ]);
    return reply.send({
      manifest,
      subjects,
      jobs: jobs.slice(0, PAGE),
      candidates: candidates.slice(0, PAGE),
      jobsNextCursor: jobs.length > PAGE ? (jobs[PAGE - 1]?.jobId ?? null) : null,
      candidatesNextCursor:
        candidates.length > PAGE ? (candidates[PAGE - 1]?.candidateId ?? null) : null,
      availability,
    } satisfies CampaignDraftImagesView);
  });

  app.get('/workshop/drafts/:draftId/images/jobs/:jobId', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = jobPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const job = await repository.get({ ownerId: session.ownerId, ...path.data });
    return job
      ? reply.send({ job: publicDraftImageJob(job) })
      : sendError(reply, request, 'NOT_FOUND');
  });

  app.get('/workshop/drafts/:draftId/images/content/:contentHash', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = contentPath.safeParse(request.params);
    const query = z.object({ revision }).strict().safeParse(request.query);
    if (!path.success || !query.success) return sendError(reply, request, 'INVALID_REQUEST');
    const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
    const stored = await packages.get(scope.ownerId, scope.draftId, query.data.revision);
    if (!stored) return sendError(reply, request, 'NOT_FOUND');
    // Owner-only candidate comparison. Character images use the stricter /preview/content route.
    const content = await repository.content(scope, path.data.contentHash);
    return content
      ? reply.type(content.mediaType).send(Buffer.from(content.bytes))
      : sendError(reply, request, 'NOT_FOUND');
  });
}
