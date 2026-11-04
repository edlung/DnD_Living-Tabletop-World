import { campaignIdSchema, entityIdSchema } from '@ltw/contracts';
import { assetIdFor, campaignRole, type Actor } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AssetContentStore } from '../assets/content-store.ts';
import { ASSET_WORKER } from '../assets/worker.ts';
import { statusOf } from '../http/command-status.ts';
import { errorBody, sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { reencodeImage } from './reencode.ts';

/**
 * A battle map the DM uploads for a place (docs/adr/0057-encounters-maps-loot.md §3): the picture
 * is re-encoded here (a PNG, JPEG or WebP, kept in its own shape, at most 1,536 px a side) and goes
 * through the asset lineage as every picture does — the DM's request, the job started and completed
 * by the server for the asset worker with the bytes it holds (generator `upload`), and the DM's
 * approval, which supersedes the place's battle map before it. A battle map derives from the
 * place's approved picture, so a place without one is refused. Command IDs follow from the
 * request, so a retried upload changes nothing twice; the running asset worker leaves these
 * requests alone (`isUploadRequest`), so no image model is ever asked for them.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface BattleMapUploadDependencies extends RouteDependencies {
  readonly assets: { readonly contents: AssetContentStore };
}

const params = z.object({ campaignId: campaignIdSchema, entityId: entityIdSchema }).strict();
const body = z
  .object({
    requestId: z.uuid(),
    /** The picture's bytes in base64. */
    image: z
      .string()
      .min(16)
      .max(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4),
  })
  .strict();

/** An upload's requests, which the running asset worker never starts. */
export const isUploadRequest = (requestId: string, campaignId: string): boolean =>
  requestId.startsWith(`${campaignId}.upload.`);

export function registerBattleMapUploadRoutes(
  app: FastifyInstance,
  deps: BattleMapUploadDependencies,
): void {
  app.post(
    '/campaigns/:campaignId/entities/:entityId/battle-map',
    { bodyLimit: Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 16 * 1024 },
    async (request, reply) => {
      const actor = await authenticate(request, reply, deps);
      if (!actor) return reply;
      const path = parseInput(params, request.params, request, reply);
      if (!path) return reply;
      const input = parseInput(body, request.body, request, reply);
      if (!input) return reply;
      const state = (await deps.engine.load(path.campaignId))?.state ?? null;
      const role = campaignRole(state, actor);
      if (role === null || state === null) return sendError(reply, request, 'NOT_FOUND');
      if (role !== 'DM') return sendError(reply, request, 'FORBIDDEN');
      if (state.entities.get(path.entityId)?.kind !== 'location')
        return sendError(reply, request, 'NOT_FOUND');
      if (!state.assets.canonical.has(path.entityId))
        return reply.code(409).send({ ...errorBody('CONFLICT', request.id), reason: 'no-picture' });
      const commandId = `${path.campaignId}.upload.${input.requestId}`;
      const requestId = `${commandId}#0`;
      const assetId = assetIdFor(requestId);
      // A retry after the picture was stored and approved: nothing to do again.
      if (state.commands.has(`${commandId}.approve`)) return reply.send({ status: 'uploaded' });
      const bytes = Buffer.from(input.image, 'base64');
      if (bytes.byteLength > MAX_UPLOAD_BYTES)
        return reply
          .code(413)
          .send({ ...errorBody('INVALID_REQUEST', request.id), reason: 'size' });
      let stored: Uint8Array;
      try {
        stored = await reencodeImage(new Uint8Array(bytes), 'uploaded-battle-map');
      } catch {
        return reply
          .code(400)
          .send({ ...errorBody('INVALID_REQUEST', request.id), reason: 'image' });
      }
      const contentHash = await deps.assets.contents.put(path.campaignId, {
        bytes: stored,
        mediaType: 'image/webp',
      });
      const steps: readonly {
        readonly id: string;
        readonly by: Actor;
        readonly command: Record<string, unknown>;
      }[] = [
        {
          id: commandId,
          by: actor,
          command: {
            type: 'RequestAsset',
            entityId: path.entityId,
            variant: 'derived',
            label: 'uploaded',
            purpose: 'battle-map',
            audience: 'players',
          },
        },
        {
          id: `${commandId}.start`,
          by: ASSET_WORKER,
          command: { type: 'StartAssetJob', requestId },
        },
        {
          id: `${commandId}.complete`,
          by: ASSET_WORKER,
          command: {
            type: 'CompleteAssetJob',
            requestId,
            contentHash,
            mediaType: 'image/webp',
            generator: { provider: 'upload', model: 'dm-upload' },
          },
        },
        { id: `${commandId}.approve`, by: actor, command: { type: 'ApproveAsset', assetId } },
      ];
      for (const step of steps) {
        if ((await deps.engine.load(path.campaignId))?.state.commands.has(step.id)) continue;
        const result = await deps.engine.execute({
          commandId: step.id,
          campaignId: path.campaignId,
          actor: step.by,
          command: step.command,
        });
        if (result.status === 'rejected') return reply.code(statusOf(result)).send(result);
      }
      request.log.info({ entityId: path.entityId }, 'battle map uploaded');
      return reply.code(201).send({ status: 'uploaded' });
    },
  );
}
