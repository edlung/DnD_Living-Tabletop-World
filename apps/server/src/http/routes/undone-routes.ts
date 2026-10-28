import {
  campaignIdSchema,
  PLAYER_COMMAND_TYPES,
  UNDONE_ACTIONS_LIMIT,
  type UndoneActionsResponse,
} from '@ltw/contracts';
import type { Actor, RecordedEvent, StoredCommand, WorldEngine, WorldState } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { actingCharacter, submitted } from '../../dm/history.ts';
import { withPerspective, type RouteDependencies } from '../request-context.ts';

/**
 * A player's own actions that the DM undid (docs/adr/0033-live-session.md, amendment of
 * 2026-10-28): undoing a later step to reach an earlier one (a time change) can take back what
 * a player did, and the player must be told. The list is built only from what this player
 * submitted, for the character of this perspective, and only for commands someone else undid
 * since the player last acted for it: never who undid it, when, or anything another
 * perspective holds. Every perspective but the
 * requester's own character gets an empty list, so the live signal (which covers this view for
 * an acting character) can only signal what the player may read.
 */
const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);
const params = z.object({ campaignId: campaignIdSchema }).strict();
const query = z.object({ perspective: z.string() }).strict();

/** The command log by ID, per campaign history (every append replaces the frozen list). */
const logMemo = new WeakMap<
  readonly RecordedEvent[],
  Promise<ReadonlyMap<string, StoredCommand>>
>();

function commandsById(
  engine: WorldEngine,
  history: readonly RecordedEvent[],
  campaignId: string,
): Promise<ReadonlyMap<string, StoredCommand>> {
  const known = logMemo.get(history);
  if (known) return known;
  const computed = engine
    .commandLog(campaignId)
    .then((log) => new Map(log.map((stored) => [stored.commandId, stored])));
  logMemo.set(history, computed);
  // A failed read is never remembered.
  computed.catch(() => logMemo.delete(history));
  return computed;
}

export function undoneActions(
  state: WorldState,
  byId: ReadonlyMap<string, StoredCommand>,
  actor: Actor,
  characterId: string,
): UndoneActionsResponse['actions'] {
  const mine = (stored: StoredCommand | undefined): stored is StoredCommand =>
    stored !== undefined &&
    stored.actor.kind === actor.kind &&
    stored.actor.actorId === actor.actorId &&
    PLAYER_TYPES.has(stored.commandType) &&
    actingCharacter(stored) === characterId;
  const traces = [...state.commands.values()];
  // News until the player acts again: an undo before the player's latest action (undone or
  // not, so a later undo never brings an older one back) has already been played past, so it
  // is no longer listed (no browser storage remembers it).
  const latest = Math.max(
    0,
    ...traces
      .filter((trace) => mine(byId.get(trace.commandId)))
      .map((trace) => trace.firstSequence),
  );
  const own = traces.flatMap((trace) => {
    if (trace.undoneBy === null) return [];
    const stored = byId.get(trace.commandId);
    const undo = byId.get(trace.undoneBy);
    if (!mine(stored) || !undo) return [];
    // The player's own undo (if ever allowed) needs no notice.
    if (undo.actor.actorId === actor.actorId) return [];
    if (undo.firstSequence < latest) return [];
    return [{ stored, order: trace.firstSequence }];
  });
  return own
    .sort((a, b) => b.order - a.order)
    .slice(0, UNDONE_ACTIONS_LIMIT)
    .map(({ stored }) => ({ commandId: stored.commandId, command: submitted(stored) }));
}

export function registerUndoneRoutes(app: FastifyInstance, deps: RouteDependencies): void {
  app.get('/campaigns/:campaignId/undone-actions', async (request, reply) => {
    const ready = await withPerspective(request, reply, deps, { params, query });
    if (!ready) return reply;
    const { actor, state, history, perspective } = ready.context;
    const holder = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
    const body: UndoneActionsResponse = {
      perspective: perspective.label,
      actions:
        holder === null
          ? []
          : undoneActions(
              state,
              await commandsById(deps.engine, history, ready.params.campaignId),
              actor,
              holder,
            ),
    };
    return reply.send(body);
  });
}
