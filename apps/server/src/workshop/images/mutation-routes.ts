import { requestDraftImageSchema, selectDraftImageSchema, workshopIdSchema } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DraftImageReference } from '../../images/draft-input.ts';
import { sendError } from '../../http/errors.ts';
import { authorizeWorkshop } from '../access.ts';
import { assessCampaignRevision } from '../packages/compiler.ts';
import type { CampaignRevisionRepository } from '../packages/store.ts';
import type { WorkshopDependencies } from '../service.ts';
import { draftImageSourceSignature, imageDigest, inheritVisualEntries } from './manifest.ts';
import { selectedReference } from './requests.ts';
import type { DraftImageDependencies } from './runtime.ts';
import { imageAvailability, publicDraftImageJob } from './views.ts';

const draftPath = z.object({ draftId: workshopIdSchema }).strict();
const jobPath = draftPath.extend({ jobId: workshopIdSchema }).strict();
const empty = z.object({}).strict();

export function registerDraftImageMutationRoutes(
  app: FastifyInstance,
  deps: WorkshopDependencies,
  packages: CampaignRevisionRepository,
  images: DraftImageDependencies,
): void {
  const { repository, runtime } = images;
  app.post('/workshop/drafts/:draftId/images/jobs', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params);
    const body = requestDraftImageSchema.safeParse(request.body);
    if (!path.success || !body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const input = body.data;
    const scope = { ownerId: session.ownerId, draftId: path.data.draftId };
    if (!(await deps.store.draft(scope.ownerId, scope.draftId)))
      return sendError(reply, request, 'NOT_FOUND');
    const previous = await repository.requestById(scope, input.requestId);
    if (previous) {
      const oldIntent = {
        revision: previous.revision,
        packageDigest: previous.packageDigest,
        expectedManifestVersion: previous.expectedManifestVersion,
        entityId: previous.entityId,
        purpose: previous.purpose,
        variant: previous.variant,
        label: previous.label,
        note: previous.input.note,
      };
      const intent = {
        revision: input.revision,
        packageDigest: input.packageDigest,
        expectedManifestVersion: input.expectedManifestVersion,
        entityId: input.entityId,
        purpose: input.purpose,
        variant: input.variant,
        label: input.label,
        note: input.note,
      };
      return imageDigest(oldIntent) === imageDigest(intent)
        ? reply.send({ job: publicDraftImageJob(previous) })
        : sendError(reply, request, 'CONFLICT');
    }
    const slot = deps.limits.expensive(`workshop:${session.ownerId}`);
    if (!slot) return sendError(reply, request, 'RATE_LIMITED');
    try {
      const availability = await imageAvailability(runtime, session.ownerId);
      if (!availability.available) return await reply.code(422).send({ availability });
      const [revision, manifest] = await Promise.all([
        packages.get(scope.ownerId, scope.draftId, input.revision),
        repository.manifest(scope, input.revision),
      ]);
      if (!revision || !manifest) return await sendError(reply, request, 'NOT_FOUND');
      if (
        revision.digest !== input.packageDigest ||
        manifest.version !== input.expectedManifestVersion
      )
        return await sendError(reply, request, 'CONFLICT');
      if (!Object.values(revision.identities.entities).includes(input.entityId))
        return await sendError(reply, request, 'NOT_FOUND');
      if ((await assessCampaignRevision(revision, session.ownerId)).readiness === 'INVALID')
        return await sendError(reply, request, 'UNPROCESSABLE');
      let reference: DraftImageReference | null = null;
      if (input.purpose !== 'image') {
        const chosen = selectedReference(
          { ...manifest, entries: inheritVisualEntries(revision, manifest.entries) },
          input.entityId,
        );
        if (!chosen || !['image/png', 'image/webp'].includes(chosen.mediaType))
          return await sendError(reply, request, 'UNPROCESSABLE');
        const content = await repository.content(scope, chosen.contentHash);
        if (!content || (content.mediaType !== 'image/png' && content.mediaType !== 'image/webp'))
          return await sendError(reply, request, 'UNPROCESSABLE');
        reference = {
          candidateId: chosen.candidateId,
          contentHash: chosen.contentHash,
          mediaType: content.mediaType,
          bytes: content.bytes,
        };
      }
      const prepared = await runtime.prepare({
        revision,
        entityId: input.entityId,
        purpose: input.purpose,
        note: input.note,
        reference,
      });
      if (prepared.status !== 'PREPARED') return await sendError(reply, request, 'UNPROCESSABLE');
      if (prepared.input.variant !== input.variant || prepared.input.label !== input.label)
        return await sendError(reply, request, 'INVALID_REQUEST');
      const sourceSignature = draftImageSourceSignature(
        revision,
        input,
        reference?.contentHash ?? null,
      );
      if (sourceSignature === null) return await sendError(reply, request, 'UNPROCESSABLE');
      const saved = await repository.request({
        ...scope,
        requestId: input.requestId,
        authSessionId: session.sessionId,
        revision: input.revision,
        packageDigest: input.packageDigest,
        expectedManifestVersion: input.expectedManifestVersion,
        input: prepared.input,
        sourceSignature,
        provider: prepared.provider,
        model: prepared.model,
        requestDigest: prepared.requestDigest,
      });
      if (saved.kind === 'not-found') return await sendError(reply, request, 'NOT_FOUND');
      // Gate 07: a grant disabled meanwhile (G07-02); the owner's active pictures at their bound (G07-01).
      if (saved.kind === 'no-grant')
        return await reply
          .code(422)
          .send({ availability: { available: false, reason: 'NO_GRANT', providers: [] } });
      if (saved.kind === 'busy') return await sendError(reply, request, 'RATE_LIMITED');
      return await (saved.kind === 'saved'
        ? reply.send({ job: publicDraftImageJob(saved.job) })
        : sendError(reply, request, 'CONFLICT'));
    } finally {
      slot.release();
    }
  });

  app.post('/workshop/drafts/:draftId/images/selection', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = draftPath.safeParse(request.params);
    const body = selectDraftImageSchema.safeParse(request.body);
    if (!path.success || !body.success || !empty.safeParse(request.query).success)
      return sendError(reply, request, 'INVALID_REQUEST');
    const saved = await repository.select({
      ...body.data,
      ownerId: session.ownerId,
      draftId: path.data.draftId,
      authSessionId: session.sessionId,
    });
    if (saved.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
    return saved.kind === 'saved'
      ? reply.send({ manifest: saved.manifest })
      : sendError(reply, request, 'CONFLICT');
  });

  app.post('/workshop/drafts/:draftId/images/jobs/:jobId/cancel', async (request, reply) => {
    const session = await authorizeWorkshop(request, reply, deps);
    if (!session) return reply;
    const path = jobPath.safeParse(request.params);
    if (
      !path.success ||
      !empty.optional().safeParse(request.body).success ||
      !empty.safeParse(request.query).success
    )
      return sendError(reply, request, 'INVALID_REQUEST');
    const saved = await repository.cancel({ ownerId: session.ownerId, ...path.data });
    if (saved.kind === 'not-found') return sendError(reply, request, 'NOT_FOUND');
    if (saved.kind === 'conflict') return sendError(reply, request, 'CONFLICT');
    deps.cancelImage?.(path.data.jobId);
    return reply.send({ job: publicDraftImageJob(saved.job) });
  });
}
