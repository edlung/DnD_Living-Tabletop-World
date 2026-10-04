import { randomUUID } from 'node:crypto';

import { replyAsNpc, type DialogueDeps } from '@ltw/ai';
import {
  campaignIdSchema,
  entityIdSchema,
  npcDialogueRequestSchema,
  type CommandResult,
  type DialogueIntent,
  type NpcDialogueResponse,
} from '@ltw/contracts';
import { campaignRole, checkTalk, npcDialogueContext, sharedSources } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendError } from '../errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../request-context.ts';
import { forPlayer } from './command-routes.ts';

/**
 * NPC dialogue over HTTP (docs/adr/0020-npc-intelligence.md §1, §3), with
 * the ADR 0009 check order. The intent's command goes through the World
 * Engine like any player command, and only then is the reply phrased, from
 * the NPC's minimal context built on the state after it. A player sees the
 * command's result as `forPlayer` shows it. Logs carry statuses and the
 * trace ID, never the player's words or the reply.
 */
export interface NpcRouteDependencies extends RouteDependencies {
  readonly ai: DialogueDeps;
}

const params = z.object({ campaignId: campaignIdSchema, npcId: entityIdSchema }).strict();

function commandOf(characterId: string, npcId: string, intent: DialogueIntent) {
  switch (intent.kind) {
    case 'talk':
      return null;
    case 'ask':
      return { type: 'AskAbout', characterId, npcId, topicId: intent.topicId };
    case 'show':
      return { type: 'ShowEvidence', characterId, npcId, knowledgeId: intent.knowledgeId };
    case 'insight':
      return { type: 'InsightCheck', characterId, npcId, topicId: intent.topicId };
  }
}

export function registerNpcRoutes(app: FastifyInstance, deps: NpcRouteDependencies): void {
  app.post('/campaigns/:campaignId/npcs/:npcId/dialogue', async (request, reply) => {
    const actor = authenticate(request, reply, deps);
    if (!actor) return reply;
    const path = parseInput(params, request.params, request, reply);
    if (!path) return reply;
    const body = parseInput(npcDialogueRequestSchema, request.body, request, reply);
    if (!body) return reply;

    const before = await deps.engine.load(path.campaignId);
    const role = campaignRole(before?.state ?? null, actor);
    if (role === null || !before) return sendError(reply, request, 'NOT_FOUND');
    const refused = (code: NpcDialogueResponse['refused'], command: CommandResult | null) => {
      const response: NpcDialogueResponse = { command, refused: code, reply: null };
      return reply.code(422).send(response);
    };
    // Can the NPC hear the character? Otherwise no command runs and nothing is said.
    const talk = checkTalk(before.state, actor, body.characterId, path.npcId);
    if (!talk.ok) {
      return talk.code === 'FORBIDDEN'
        ? sendError(reply, request, 'FORBIDDEN')
        : refused(talk.code, null);
    }

    const command = commandOf(body.characterId, path.npcId, body.intent);
    const result = command
      ? await deps.engine.execute({
          commandId: `dialogue:${actor.actorId}:${randomUUID()}`,
          campaignId: path.campaignId,
          actor,
          command,
        })
      : null;
    const seen = result && (role === 'PLAYER' ? forPlayer(result) : result);

    const after = await deps.engine.load(path.campaignId);
    const heard = after && checkTalk(after.state, actor, body.characterId, path.npcId);
    if (!after || !heard?.ok) return refused(heard && !heard.ok ? heard.code : 'NO_EFFECT', seen);
    const accepted = result === null || result.status !== 'rejected';
    const context = npcDialogueContext(after.state, {
      speaker: heard.speaker,
      npcId: path.npcId,
      topicId: 'topicId' in body.intent ? body.intent.topicId : null,
      justShared: result && accepted ? sharedSources(after.history, result.commandId) : [],
    });
    if (!context) return refused('NO_EFFECT', seen);

    const npcReply = await replyAsNpc(deps.ai, {
      campaignId: path.campaignId,
      actor,
      context,
      intent: body.intent,
      accepted,
      commandId: result?.commandId ?? null,
      line: body.line ?? null,
    });
    request.log.info(
      {
        actorId: actor.actorId,
        intent: body.intent.kind,
        commandStatus: result?.status ?? null,
        traceId: npcReply.traceId,
        replyStatus: npcReply.status,
      },
      'npc dialogue',
    );
    const response: NpcDialogueResponse = { command: seen, refused: null, reply: npcReply };
    return reply.send(response);
  });
}
