import {
  enqueueCampaignGenerationSchema,
  retryCampaignGenerationSchema,
  workshopIdSchema,
  type CampaignGenerationView,
} from '@ltw/contracts';
import { seedCampaignPackage } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import { MAX_CAMPAIGN_PACKAGE_BYTES } from '../packages/content.ts';
import type { WorkshopDependencies } from '../service.ts';
import type { CampaignGenerationDependencies } from './runtime.ts';
import { generationJobView, generationStepView } from './views.ts';

const empty = z.object({}).strict();
const draftPath = z.object({ draftId: workshopIdSchema }).strict();
const jobPath = draftPath.extend({ jobId: workshopIdSchema }).strict();
const tracePath = jobPath.extend({ traceId: workshopIdSchema }).strict();
const listQuery = z.object({ after: workshopIdSchema.optional() }).strict();
const PAGE_SIZE = 25;

/** Polling uses ordinary durable workshop authorization on every request. */
export function registerCampaignGenerationRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  generation: CampaignGenerationDependencies,
  cancelInFlight: (jobId: string) => void = () => undefined,
): void {
  const repository = generation.repository;
  const editing = repository.mode === 'EDIT';
  const base = `/workshop/drafts/:draftId/${editing ? 'edits' : 'generation'}`;
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
  const owned = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return null;
    const path = draftPath.loose().safeParse(request.params);
    if (!path.success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    const draft = await deps.store.draft(session.ownerId, path.data.draftId);
    if (!draft) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { session, draft, scope: { ownerId: session.ownerId, draftId: draft.draftId } };
  };

  if (!editing)
    app.get(`${base}/availability`, async (request, reply) => {
      const grant = await owned(request, reply);
      if (!grant) return reply;
      if (!draftPath.safeParse(request.params).success || !empty.safeParse(request.query).success)
        return sendError(reply, request, 'INVALID_REQUEST');
      return reply.send(await generation.preparation.availability(grant.session.ownerId));
    });

  if (!editing)
    app.post(
      base,
      { bodyLimit: MAX_CAMPAIGN_PACKAGE_BYTES + 16 * 1024 },
      async (request, reply) => {
        const grant = await owned(request, reply);
        if (!grant) return reply;
        const input = enqueueCampaignGenerationSchema.safeParse(request.body);
        if (
          !draftPath.safeParse(request.params).success ||
          !input.success ||
          !empty.safeParse(request.query).success
        )
          return sendError(reply, request, 'INVALID_REQUEST');
        return limited(grant.session.ownerId, request, reply, async () => {
          const availability = await generation.preparation.availability(grant.session.ownerId);
          if (!availability.available) return reply.code(422).send({ availability });
          const result = await repository.enqueue({
            ...grant.scope,
            authSessionId: grant.session.sessionId,
            requestId: input.data.requestId,
            basedOnRevision: input.data.basedOnRevision,
            seed: seedCampaignPackage({
              title: grant.draft.title,
              language: grant.draft.language,
              brief: input.data.brief,
            }),
          });
          if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
          if (result.kind === 'conflict') return sendError(reply, request, 'CONFLICT');
          return reply.send({ job: generationJobView(result.job) });
        });
      },
    );

  app.get(base, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const query = listQuery.safeParse(request.query);
    if (!draftPath.safeParse(request.params).success || !query.success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const before = query.data.after
      ? await repository.get({ ...grant.scope, jobId: query.data.after })
      : null;
    if (query.data.after && !before) return sendError(reply, request, 'NOT_FOUND');
    const jobs = await repository.list(grant.scope, PAGE_SIZE + 1, before);
    return reply.send({
      jobs: jobs.slice(0, PAGE_SIZE),
      nextCursor: jobs.length > PAGE_SIZE ? (jobs[PAGE_SIZE - 1]?.jobId ?? null) : null,
    });
  });

  app.get(`${base}/:jobId/progress`, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const path = jobPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const scope = { ...grant.scope, jobId: path.data.jobId };
    const progress = await repository.progress(scope);
    return progress ? reply.send(progress) : sendError(reply, request, 'NOT_FOUND');
  });

  app.get(`${base}/:jobId`, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const path = jobPath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const scope = { ...grant.scope, jobId: path.data.jobId };
    const job = await repository.get(scope);
    if (!job) return sendError(reply, request, 'NOT_FOUND');
    const [steps, candidate] = await Promise.all([
      repository.steps(scope),
      repository.candidate(scope),
    ]);
    return reply.send({
      job: generationJobView(job),
      steps: steps.map(generationStepView),
      candidate,
    } satisfies CampaignGenerationView);
  });

  app.post(`${base}/:jobId/cancel`, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const path = jobPath.safeParse(request.params);
    if (
      !path.success ||
      !empty.safeParse(request.body).success ||
      !empty.safeParse(request.query).success
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    const result = await repository.cancel({ ...grant.scope, jobId: path.data.jobId });
    if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
    if (result.kind === 'conflict') return sendError(reply, request, 'CONFLICT');
    cancelInFlight(path.data.jobId);
    return reply.send({ job: generationJobView(result.job) });
  });

  app.post(`${base}/:jobId/retry`, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const path = jobPath.safeParse(request.params),
      input = retryCampaignGenerationSchema.safeParse(request.body);
    if (!path.success || !input.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return limited(grant.session.ownerId, request, reply, async () => {
      if (editing && (await repository.requestById(grant.scope, input.data.requestId))) {
        const replay = await repository.retry(
          { ...grant.scope, jobId: path.data.jobId },
          input.data.requestId,
          grant.session.sessionId,
        );
        return replay.kind === 'saved'
          ? reply.send({ job: generationJobView(replay.job) })
          : sendError(reply, request, replay.kind === 'not-found' ? 'NOT_FOUND' : 'CONFLICT');
      }
      const availability = await generation.preparation.availability(grant.session.ownerId);
      if (!availability.available) return reply.code(422).send({ availability });
      const result = await repository.retry(
        { ...grant.scope, jobId: path.data.jobId },
        input.data.requestId,
        grant.session.sessionId,
      );
      if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
      if (result.kind === 'conflict') return sendError(reply, request, 'CONFLICT');
      return reply.send({ job: generationJobView(result.job) });
    });
  });

  app.get(`${base}/:jobId/traces/:traceId`, async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const path = tracePath.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const scope = { ...grant.scope, jobId: path.data.jobId };
    if (!(await repository.get(scope))) return sendError(reply, request, 'NOT_FOUND');
    const steps = await repository.steps(scope);
    if (!steps.some((step) => step.traceId === path.data.traceId))
      return sendError(reply, request, 'NOT_FOUND');
    const trace = await generation.preparation.trace?.(
      scope.ownerId,
      scope.draftId,
      path.data.traceId,
    );
    return trace ? reply.send({ trace }) : sendError(reply, request, 'NOT_FOUND');
  });
}
