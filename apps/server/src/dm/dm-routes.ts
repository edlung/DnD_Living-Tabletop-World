import {
  campaignIdSchema,
  parsePerspective,
  recordSubstitutionRequestSchema,
  type RecordSubstitutionResponse,
} from '@ltw/contracts';
import {
  campaignRole,
  resolvePerspective,
  type Actor,
  type CampaignSnapshot,
  type WallClock,
} from '@ltw/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendError } from '../http/errors.ts';
import { authenticate, parseInput, type RouteDependencies } from '../http/request-context.ts';
import { httpCommandId } from '../http/routes/command-routes.ts';
import { dmHistoryPage } from './history.ts';
import { registerDmNoteRoutes } from './note-routes.ts';
import type { SavedEncounterStore } from '../combat/saved-encounter-store.ts';
import type { DmNoteStore } from './note-store.ts';
import {
  sameSubstitution,
  type SubstitutionRecord,
  type SubstitutionStore,
} from './substitution-store.ts';

/**
 * The DM's table tools (docs/adr/0033-live-session.md §6–7; docs/STAGE_310_DESIGN.md §B–C), in
 * the ADR 0009 order: 401, then 400 for input, then 404 for anyone who is not this campaign's
 * DM (the 404 of a campaign that does not exist), then 403 for the DM holding a lower
 * perspective. Neither route adds authority: the DM's commands go through `POST …/commands`
 * and are decided by the World Engine like any other; undo uses the existing routes.
 */
export interface DmDependencies {
  readonly substitutions: SubstitutionStore;
  /** The DM's notes (ADR 0043 §5). */
  readonly notes: DmNoteStore;
  /** The DM's saved encounters (docs/adr/0057-encounters-maps-loot.md §1). */
  readonly encounters: SavedEncounterStore;
  readonly clock: WallClock;
}

export interface DmRouteDependencies extends RouteDependencies {
  readonly dm: DmDependencies;
}

const params = z.object({ campaignId: campaignIdSchema }).strict();
const historyQuery = z
  .object({
    perspective: z.string(),
    before: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

export function registerDmRoutes(app: FastifyInstance, deps: DmRouteDependencies): void {
  /** The DM's own campaign, or null after sending 401/400/404. */
  const asDm = async <B>(
    request: FastifyRequest,
    reply: FastifyReply,
    input: (request: FastifyRequest, reply: FastifyReply) => B | null,
  ): Promise<{ actor: Actor; campaignId: string; snapshot: CampaignSnapshot; input: B } | null> => {
    const actor = await authenticate(request, reply, deps);
    if (!actor) return null;
    // The campaign only: a route's own path parameters (a note's ID) are its input's to check.
    const campaignId = (request.params as { readonly campaignId?: unknown }).campaignId;
    const path = parseInput(params, { campaignId }, request, reply);
    if (!path) return null;
    const parsed = input(request, reply);
    if (parsed === null) return null;
    const snapshot = await deps.engine.load(path.campaignId);
    if (!snapshot || campaignRole(snapshot.state, actor) !== 'DM') {
      sendError(reply, request, 'NOT_FOUND');
      return null;
    }
    return { actor, campaignId: path.campaignId, snapshot, input: parsed };
  };

  /**
   * The DM's reason for acting for a player's character, recorded before the DM submits the
   * command with the same client command ID. Descriptive DM data (migration 0009); the answer
   * says only whether it was recorded now or already.
   */
  app.post('/campaigns/:campaignId/dm/substitutions', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) =>
      parseInput(recordSubstitutionRequestSchema, req.body, req, rep),
    );
    if (!dm) return reply;
    const { actor, campaignId, snapshot, input } = dm;
    const note = input.note?.trim() ?? '';
    const record: SubstitutionRecord = {
      campaignId,
      commandId: httpCommandId(actor.actorId, input.clientCommandId),
      characterId: input.characterId,
      reason: input.reason,
      note: note === '' ? null : note,
      createdAt: deps.dm.clock.now(),
    };
    const answer = (status: RecordSubstitutionResponse['status']) => {
      request.log.info(
        { actorId: actor.actorId, reason: record.reason, status },
        'dm substitution',
      );
      const body: RecordSubstitutionResponse = { status };
      return reply.code(status === 'recorded' ? 201 : 200).send(body);
    };
    const stored = await deps.dm.substitutions.find(campaignId, record.commandId);
    if (stored) {
      return sameSubstitution(stored, record)
        ? answer('duplicate')
        : sendError(reply, request, 'CONFLICT');
    }
    // Only a character that has a player: anyone else the DM simply runs.
    if (!snapshot.state.roster.has(record.characterId)) {
      return sendError(reply, request, 'UNPROCESSABLE');
    }
    // The reason comes before its command, never after it.
    if (snapshot.state.commands.has(record.commandId)) {
      return sendError(reply, request, 'CONFLICT');
    }
    const outcome = await deps.dm.substitutions.record(record);
    return outcome === 'conflict' ? sendError(reply, request, 'CONFLICT') : answer(outcome);
  });

  /**
   * The DM history, newest first, 20 per page (`before` pages by sequence). Only in the DM
   * perspective: a lower one is refused without looking at what it names.
   */
  app.get('/campaigns/:campaignId/dm/history', async (request, reply) => {
    const dm = await asDm(request, reply, (req, rep) => {
      const query = parseInput(historyQuery, req.query, req, rep);
      if (!query) return null;
      const perspective = parsePerspective(query.perspective);
      if (!perspective) {
        sendError(rep, req, 'INVALID_REQUEST');
        return null;
      }
      return { perspective, before: query.before };
    });
    if (!dm) return reply;
    const { actor, campaignId, snapshot, input } = dm;
    if (input.perspective.kind !== 'DM') return sendError(reply, request, 'FORBIDDEN');
    const access = resolvePerspective(snapshot.state, actor, input.perspective);
    if (!access.ok) return sendError(reply, request, access.reason);
    const page = await dmHistoryPage(
      deps.engine,
      deps.dm.substitutions,
      snapshot,
      actor,
      campaignId,
      input.before,
      request.log,
    );
    return reply.send(page);
  });

  registerDmNoteRoutes(app, deps, asDm);
}
