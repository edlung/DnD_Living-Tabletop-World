import {
  enqueueCampaignEditSchema,
  planCampaignEditSchema,
  workshopIdSchema,
  type EnqueueCampaignEdit,
  type CampaignRevisionConflictView,
} from '@ltw/contracts';
import { buildCampaignEditPlan } from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import { newVisualManifest } from '../images/manifest.ts';
import type { WorkshopDependencies } from '../service.ts';
import type { StoredGenerationJob } from './store.ts';
import { generationJobView } from './views.ts';

const pathSchema = z.object({ draftId: workshopIdSchema }).strict();
const empty = z.object({}).strict();
const conflict = (
  reply: FastifyReply,
  reason: CampaignRevisionConflictView['conflict']['reason'],
) => reply.code(409).send({ conflict: { reason } } satisfies CampaignRevisionConflictView);
const canonicalTargets = (targets: readonly string[]) => [...new Set(targets)].sort();

/** A nonce binds the normalized owner request, independently of current policy/availability. */
function matchesRequest(job: StoredGenerationJob, input: EnqueueCampaignEdit): boolean {
  const spec = job.editSpec;
  return (
    job.retryOf === null &&
    spec !== null &&
    job.baseRevision === input.revision &&
    spec.baselineDigest === input.packageDigest &&
    job.lockVersion === input.expectedLockVersion &&
    spec.manifestVersion === input.manifestVersion &&
    spec.manifestDigest === input.manifestDigest &&
    spec.instruction === input.instruction &&
    JSON.stringify(spec.requestedTargets) === JSON.stringify(canonicalTargets(input.targets))
  );
}

/** EDIT resolves permissions from owned stored state, never client-supplied closure or package. */
export function registerCampaignEditRequestRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
): void {
  const { packages, revisionControls, edits, images } = deps;
  if (!packages || !revisionControls || !edits || edits.repository.mode !== 'EDIT') return;
  const owned = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return null;
    const path = pathSchema.safeParse(request.params);
    if (!path.success || !empty.safeParse(request.query).success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
    if (!(await deps.store.draft(scope.ownerId, scope.draftId))) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { session, scope };
  };
  const plan = async (
    scope: { ownerId: string; draftId: string },
    input: z.infer<typeof planCampaignEditSchema>,
    reply: FastifyReply,
  ) => {
    const revision = await packages.latest(scope.ownerId, scope.draftId);
    if (
      !revision ||
      revision.revision !== input.revision ||
      revision.digest !== input.packageDigest
    ) {
      conflict(reply, 'STALE_REVISION');
      return null;
    }
    const locks = await revisionControls.locks(scope);
    if (!locks || locks.version !== input.expectedLockVersion) {
      conflict(reply, 'STALE_LOCKS');
      return null;
    }
    const manifest =
      (await images?.repository.manifest(scope, revision.revision)) ??
      newVisualManifest(revision, 0, [], revision.createdAt);
    if (manifest.version !== input.manifestVersion || manifest.digest !== input.manifestDigest) {
      conflict(reply, 'STALE_MANIFEST');
      return null;
    }
    return {
      revision,
      view: buildCampaignEditPlan(revision, locks, manifest, input.instruction, input.targets),
    };
  };

  app.post('/workshop/drafts/:draftId/edits/plan', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const body = planCampaignEditSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const resolved = await plan(grant.scope, body.data, reply);
    return resolved ? reply.send(resolved.view) : reply;
  });

  app.post('/workshop/drafts/:draftId/edits', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const body = enqueueCampaignEditSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 'INVALID_REQUEST');
    const input = body.data;
    const prior = await edits.repository.requestById(grant.scope, input.requestId);
    if (prior) {
      if (!matchesRequest(prior, input) || prior.editSpec === null)
        return conflict(reply, 'REQUEST_REUSED');
      const replay = await edits.repository.enqueueEdit({
        ...grant.scope,
        authSessionId: grant.session.sessionId,
        requestId: input.requestId,
        basedOnRevision: prior.baseRevision,
        seed: prior.seed,
        lockVersion: prior.lockVersion,
        editSpec: prior.editSpec,
      });
      return replay.kind === 'saved'
        ? reply.send({ job: generationJobView(replay.job) })
        : replay.kind === 'not-found'
          ? sendError(reply, request, 'NOT_FOUND')
          : conflict(reply, 'REQUEST_REUSED');
    }
    const slot = deps.limits.expensive(`workshop:${grant.scope.ownerId}`);
    if (!slot) return sendError(reply, request, 'RATE_LIMITED');
    try {
      const resolved = await plan(grant.scope, input, reply);
      if (!resolved) return await reply;
      if (!resolved.view.spec) return await conflict(reply, 'INVALID_TARGET');
      const availability = await edits.preparation.availability(grant.scope.ownerId);
      if (!availability.available) return await reply.code(422).send({ availability });
      const result = await edits.repository.enqueueEdit({
        ...grant.scope,
        authSessionId: grant.session.sessionId,
        requestId: input.requestId,
        basedOnRevision: resolved.revision.revision,
        seed: resolved.revision.content,
        lockVersion: input.expectedLockVersion,
        editSpec: resolved.view.spec,
      });
      return result.kind === 'saved'
        ? await reply.send({ job: generationJobView(result.job) })
        : result.kind === 'not-found'
          ? await sendError(reply, request, 'NOT_FOUND')
          : await conflict(reply, 'STALE_REVISION');
    } finally {
      slot.release();
    }
  });
}
