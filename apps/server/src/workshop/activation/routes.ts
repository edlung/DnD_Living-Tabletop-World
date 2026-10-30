import {
  startCampaignActivationSchema,
  workshopIdSchema,
  type CampaignActivationConflict,
  type StartCampaignActivation,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import type { WorkshopDependencies } from '../service.ts';
import { loadCampaignActivationReview } from './review.ts';
import type { ActivationMutation, ActivationConflictReason } from './store.ts';
import { activationView } from './views.ts';

const empty = z.object({}).strict();
const path = z.object({ draftId: workshopIdSchema }).strict();
const operationPath = path.extend({ activationId: workshopIdSchema }).strict();
const revisionNumber = z
  .string()
  .regex(/^[1-9][0-9]{0,6}$/)
  .transform(Number)
  .pipe(z.number().max(1_000_000));
const reviewQuery = z
  .object({
    revision: revisionNumber.optional(),
    textOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .strict();
const conflict = (reply: FastifyReply, reason: ActivationConflictReason) =>
  reply.code(409).send({ conflict: { reason } } satisfies CampaignActivationConflict);
function answer(reply: FastifyReply, request: FastifyRequest, result: ActivationMutation) {
  if (result.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
  if (result.kind === 'conflict') return conflict(reply, result.reason);
  return reply.send({ activation: activationView(result.activation) });
}
function mismatch(
  input: StartCampaignActivation,
  review: NonNullable<Awaited<ReturnType<typeof loadCampaignActivationReview>>>['review'],
): ActivationConflictReason | null {
  if (input.revision !== review.revision || input.packageDigest !== review.packageDigest)
    return 'STALE_REVISION';
  if (input.expectedLockVersion !== review.lockVersion || input.lockDigest !== review.lockDigest)
    return 'STALE_LOCKS';
  if (
    input.manifestVersion !== review.manifestVersion ||
    input.manifestDigest !== review.manifestDigest
  )
    return 'STALE_MANIFEST';
  if (
    input.planDigest !== review.planDigest ||
    input.reviewDigest !== review.reviewDigest ||
    input.textOnly !== review.textOnly
  )
    return 'STALE_REVIEW';
  const warnings = review.findings
    .filter((finding) => finding.severity === 'warning')
    .map((finding) => finding.findingId)
    .sort();
  const acknowledgements = [...new Set(input.acknowledgedFindingIds)].sort();
  if (JSON.stringify(warnings) !== JSON.stringify(acknowledgements)) return 'ACKNOWLEDGEMENTS';
  return null;
}

/** Small owner confirmation bodies only. No supplied scenario, operations, actor or provenance. */
export function registerCampaignActivationRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
): void {
  const activation = deps.activation;
  if (!activation || !deps.packages || !deps.images || !deps.revisionControls) return;
  const owned = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return null;
    const parsed = path.loose().safeParse(request.params);
    if (!parsed.success) {
      sendError(reply, request, 'INVALID_REQUEST');
      return null;
    }
    const scope = { ownerId: session.ownerId, draftId: parsed.data.draftId };
    if (!(await deps.store.draft(scope.ownerId, scope.draftId))) {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { session, scope };
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
  app.get('/workshop/drafts/:draftId/activation-review', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const query = reviewQuery.safeParse(request.query);
    if (!path.safeParse(request.params).success || !query.success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return limited(grant.scope.ownerId, request, reply, async () => {
      const result = await loadCampaignActivationReview(deps, grant.scope, query.data);
      return result ? reply.send(result.review) : sendError(reply, request, 'NOT_FOUND');
    });
  });
  app.get('/workshop/drafts/:draftId/activation', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    if (!path.safeParse(request.params).success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    return reply.send({ activation: await activation.repository.status(grant.scope) });
  });
  app.post('/workshop/drafts/:draftId/activation', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const body = startCampaignActivationSchema.safeParse(request.body);
    if (
      !path.safeParse(request.params).success ||
      !body.success ||
      !empty.safeParse(request.query).success
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    const previous =
      (await activation.repository.byRequest(grant.scope, body.data.requestId)) ??
      (await activation.repository.get(grant.scope));
    if (previous)
      return answer(
        reply,
        request,
        await activation.repository.begin({
          ...grant.scope,
          authSessionId: grant.session.sessionId,
          request: body.data,
          frozen: previous.frozen,
        }),
      );
    return limited(grant.scope.ownerId, request, reply, async () => {
      const latest = await deps.packages?.latest(grant.scope.ownerId, grant.scope.draftId);
      if (!latest) return sendError(reply, request, 'NOT_FOUND');
      if (latest.revision !== body.data.revision) return conflict(reply, 'STALE_REVISION');
      const prepared = await loadCampaignActivationReview(deps, grant.scope, {
        revision: body.data.revision,
        textOnly: body.data.textOnly,
      });
      if (!prepared) return sendError(reply, request, 'NOT_FOUND');
      const reason = mismatch(body.data, prepared.review);
      if (reason) return conflict(reply, reason);
      if (!prepared.review.confirmable || !prepared.frozen) return conflict(reply, 'NOT_READY');
      return answer(
        reply,
        request,
        await activation.repository.begin({
          ...grant.scope,
          authSessionId: grant.session.sessionId,
          request: body.data,
          frozen: {
            ...prepared.frozen,
            acknowledgedFindingIds: [...new Set(body.data.acknowledgedFindingIds)].sort(),
          },
        }),
      );
    });
  });
  app.post('/workshop/drafts/:draftId/activation/:activationId/retry', async (request, reply) => {
    const grant = await owned(request, reply);
    if (!grant) return reply;
    const parsed = operationPath.safeParse(request.params);
    if (
      !parsed.success ||
      !empty.safeParse(request.query).success ||
      !empty.safeParse(request.body).success
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    return limited(grant.scope.ownerId, request, reply, async () =>
      answer(
        reply,
        request,
        await activation.repository.retry(
          { ...grant.scope, activationId: parsed.data.activationId },
          grant.session.sessionId,
        ),
      ),
    );
  });
}
