import {
  agreementRequestSchema,
  agreementUnderstoodRequestSchema,
  campaignIdSchema,
  type AgreementRequest,
  type AgreementResponse,
  type AgreementView,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { WindowCounter } from '../auth/window-counter.ts';
import { sendError } from '../http/errors.ts';
import { withBody, withPerspective, type RouteDependencies } from '../http/request-context.ts';
import type { AgreementRecord, AgreementStore } from './agreement-store.ts';

/**
 * The table's agreement over HTTP (docs/adr/0071-memory-and-ritual.md §4), in the ADR 0009 order.
 * The DM writes it; every member and a table display read it — it holds nothing of the world, so
 * each perspective reads the same page. A player says "Understood" for their own character, the
 * DM for anyone at the table (a child without a screen); who has said it is the DM's to read.
 */
export interface AgreementDependencies {
  readonly store: AgreementStore;
  readonly now: () => string;
}

export interface AgreementRouteDependencies extends RouteDependencies {
  readonly agreement: AgreementDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();
const WRITES_PER_MINUTE = 20;

const wordsOf = (record: AgreementRequest): AgreementRequest => ({
  tone: record.tone,
  toneNote: record.toneNote,
  limits: [...record.limits].sort(),
  alsoNot: record.alsoNot,
  pauseSign: record.pauseSign,
  ages: record.ages,
});

const viewOf = (record: AgreementRecord): AgreementView => ({
  ...wordsOf(record),
  version: record.version,
  updatedAt: record.updatedAt,
});

export function registerAgreementRoutes(
  app: FastifyInstance,
  deps: AgreementRouteDependencies,
): void {
  const { store, now } = deps.agreement;
  const limit = new WindowCounter({ limit: WRITES_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });

  app.get('/campaigns/:campaignId/agreement', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { context, params: path } = ready;
    const { state, perspective } = context;
    const record = await store.read(path.campaignId);
    const said = record === null ? [] : await store.understood(path.campaignId);
    const understands = (characterId: string) =>
      record !== null &&
      said.some((entry) => entry.characterId === characterId && entry.version >= record.version);
    const body: AgreementResponse = {
      perspective: perspective.label,
      agreement: record === null ? null : viewOf(record),
      understood:
        perspective.kind === 'CHARACTER' && perspective.holderId !== null
          ? understands(perspective.holderId)
          : null,
      readers:
        perspective.kind === 'DM'
          ? [...state.entities.values()]
              .filter((entity) => entity.kind === 'character')
              .map((entity) => ({
                character: { entityId: entity.entityId, name: entity.name },
                understood: understands(entity.entityId),
              }))
              .sort((a, b) => a.character.name.localeCompare(b.character.name))
          : null,
    };
    return reply.send(body);
  });

  app.post('/campaigns/:campaignId/agreement', async (request, reply) => {
    const ready = await withBody(request, reply, deps, { params, body: agreementRequestSchema });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    if (context.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    const before = await store.read(path.campaignId);
    const words = wordsOf(body);
    // The same words keep their version: nobody is asked to read again what did not change.
    if (before !== null && JSON.stringify(wordsOf(before)) === JSON.stringify(words)) {
      return reply.code(204).send();
    }
    await store.write({
      ...words,
      campaignId: path.campaignId,
      version: (before?.version ?? 0) + 1,
      updatedAt: now(),
    });
    return reply.code(204).send();
  });

  app.post('/campaigns/:campaignId/agreement/understood', async (request, reply) => {
    const ready = await withBody(request, reply, deps, {
      params,
      body: agreementUnderstoodRequestSchema,
    });
    if (!ready) return reply;
    const { context, params: path, body } = ready;
    const { perspective, state } = context;
    const own = perspective.kind === 'CHARACTER' && perspective.holderId === body.characterId;
    // A player for their own character; the DM for anyone at the table. Nobody else.
    if (perspective.kind !== 'DM' && !own) return sendError(reply, request, 'FORBIDDEN');
    if (state.entities.get(body.characterId)?.kind !== 'character') {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    const record = await store.read(path.campaignId);
    // Only the page as it stands: nobody agrees to words they did not see.
    if (record?.version !== body.version) return sendError(reply, request, 'UNPROCESSABLE');
    if (limit.take(`${path.campaignId}\n${context.actor.actorId}`, Date.now()) === 'limited') {
      return sendError(reply, request, 'RATE_LIMITED');
    }
    await store.markUnderstood({
      campaignId: path.campaignId,
      characterId: body.characterId,
      version: body.version,
      at: now(),
    });
    return reply.code(204).send();
  });
}
