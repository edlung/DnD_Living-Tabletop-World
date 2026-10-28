import type { AiTraceStore } from '@ltw/ai';
import {
  campaignIdSchema,
  commitProposalRequestSchema,
  createProposalRequestSchema,
  proposalIdSchema,
  reviseProposalRequestSchema,
} from '@ltw/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  AuthoringService,
  type AuthoringDependencies,
  type AuthoringOutcome,
} from '../../authoring/service.ts';
import { statusOf } from '../command-status.ts';
import { sendError } from '../errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../request-context.ts';

/**
 * Authoring proposals over HTTP (docs/adr/0018-ai-authoring.md §8): DM only,
 * in the ADR 0009 check order (401, 400, 404 for a non-member, 403 for a
 * player). World Engine rejections reach the DM with their details (issues,
 * warnings, the consent required, undo blockers). Logs carry proposal IDs and
 * outcomes, never proposal content. The list of open drafts and the cancel (owner decisions 11,
 * SI-D1) answer in the same order.
 */
export interface AuthoringRouteDependencies extends RouteDependencies {
  readonly ai: { readonly traces: AiTraceStore };
  readonly authoring: AuthoringDependencies;
}

const campaignParams = z.object({ campaignId: campaignIdSchema }).strict();
const proposalParams = z
  .object({ campaignId: campaignIdSchema, proposalId: proposalIdSchema })
  .strict();

export function registerAuthoringRoutes(
  app: FastifyInstance,
  deps: AuthoringRouteDependencies,
): void {
  const service = new AuthoringService(deps.engine, deps.ai.traces, deps.authoring);
  const base = '/campaigns/:campaignId/authoring/proposals';

  app.post(base, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(campaignParams, request.params, request, reply);
    if (!params) return reply;
    const body = parseInput(createProposalRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const outcome = await service.create(actor, params.campaignId, body);
    if (outcome.kind === 'ok')
      logged(request, 'authoring proposal created', outcome.value.proposal);
    return send(request, reply, outcome, 201);
  });

  app.get(base, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(campaignParams, request.params, request, reply);
    if (!params) return reply;
    return send(request, reply, await service.open(actor, params.campaignId));
  });

  app.get(`${base}/:proposalId`, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(proposalParams, request.params, request, reply);
    if (!params) return reply;
    return send(request, reply, await service.view(actor, params.campaignId, params.proposalId));
  });

  app.post(`${base}/:proposalId/revisions`, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(proposalParams, request.params, request, reply);
    if (!params) return reply;
    const body = parseInput(reviseProposalRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const outcome = await service.revise(actor, params.campaignId, params.proposalId, body);
    if (outcome.kind === 'ok')
      logged(request, 'authoring proposal revised', outcome.value.proposal);
    return send(request, reply, outcome, 201);
  });

  app.post(`${base}/:proposalId/commit`, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(proposalParams, request.params, request, reply);
    if (!params) return reply;
    const body = parseInput(commitProposalRequestSchema, request.body, request, reply);
    if (!body) return reply;
    const outcome = await service.commit(actor, params.campaignId, params.proposalId, body);
    request.log.info(
      { actorId: actor.actorId, proposalId: params.proposalId, outcome: outcomeOf(outcome) },
      'authoring commit',
    );
    return send(request, reply, outcome);
  });

  app.post(`${base}/:proposalId/cancel`, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(proposalParams, request.params, request, reply);
    if (!params) return reply;
    const outcome = await service.cancel(actor, params.campaignId, params.proposalId);
    if (outcome.kind === 'ok')
      logged(request, 'authoring proposal cancelled', outcome.value.proposal);
    return send(request, reply, outcome);
  });

  app.post(`${base}/:proposalId/undo`, async (request, reply) => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return reply;
    const params = parseInput(proposalParams, request.params, request, reply);
    if (!params) return reply;
    const outcome = await service.undo(actor, params.campaignId, params.proposalId);
    request.log.info(
      { actorId: actor.actorId, proposalId: params.proposalId, outcome: outcomeOf(outcome) },
      'authoring undo',
    );
    return send(request, reply, outcome);
  });
}

function send<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  outcome: AuthoringOutcome<T>,
  status = 200,
): FastifyReply {
  switch (outcome.kind) {
    case 'ok':
      return reply.code(status).send(outcome.value);
    case 'error':
      return sendError(reply, request, outcome.code);
    case 'rejected':
      return reply.code(statusOf(outcome.result)).send(outcome.result);
  }
}

function logged(
  request: FastifyRequest,
  message: string,
  proposal: { readonly proposalId: string; readonly revision: number },
): void {
  request.log.info({ proposalId: proposal.proposalId, revision: proposal.revision }, message);
}

function outcomeOf(outcome: AuthoringOutcome<unknown>): string {
  return outcome.kind === 'rejected' ? outcome.result.code : outcome.kind;
}
