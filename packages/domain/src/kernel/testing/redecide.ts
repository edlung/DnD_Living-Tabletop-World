import type { CharacterSheet, Skill } from '@ltw/contracts';

import { authorize } from '../authorization.ts';
import { decide } from '../decide/decide.ts';
import type { StoredCommand } from '../engine/event-store.ts';
import { EVENT_SCHEMA_VERSION, type RecordedEvent } from '../events.ts';
import { evolve } from '../evolve.ts';
import { EMPTY_WORLD_STATE, type WorldState } from '../state.ts';

/**
 * Independent oracle for dependency-preserving undo (ADR 0006 §8; Gate 02
 * G02-H02/H03). The commands still effective after any sequence of undos
 * must each be authorized and accepted again, with the same events, when
 * re-decided in order from an empty campaign. A dependency missing from any
 * footprint shows up as a command that is no longer legal or decides
 * differently, whatever premises the command recorded. Test support only.
 */
export interface Divergence {
  readonly commandId: string;
  readonly commandType: string;
  readonly reason: string;
}

export function redecideEffective(
  log: readonly StoredCommand[],
  original: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  skillModifier: (sheet: CharacterSheet, skill: Skill) => number,
): Divergence | null {
  const recorded = new Map<string, unknown[]>();
  for (const event of original.history) {
    const list = recorded.get(event.causation.commandId) ?? [];
    list.push({ type: event.type, payload: event.payload });
    recorded.set(event.causation.commandId, list);
  }
  let state = EMPTY_WORLD_STATE;
  const history: RecordedEvent[] = [];
  for (const stored of log) {
    if (stored.commandType === 'UndoCommand') continue;
    if (original.state.commands.get(stored.commandId)?.undoneBy !== null) continue;
    const where = { commandId: stored.commandId, commandType: stored.commandType };
    const authorization = authorize(state, stored.actor, stored.command);
    if (!authorization.ok) {
      return { ...where, reason: `no longer authorized: ${authorization.rejection.code}` };
    }
    const decision = decide(
      {
        state,
        history,
        campaignId: stored.campaignId,
        commandId: stored.commandId,
        actor: stored.actor,
        authority: authorization.authority,
        skillModifier,
      },
      stored.command,
    );
    if (!decision.ok) return { ...where, reason: `no longer accepted: ${decision.rejection.code}` };
    if (canonical(decision.events) !== canonical(recorded.get(stored.commandId) ?? [])) {
      return { ...where, reason: 'decides differently under current canon' };
    }
    for (const draft of decision.events) {
      const sequence = state.version + 1;
      const event = {
        ...draft,
        campaignId: stored.campaignId,
        sequence,
        eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        schemaVersion: EVENT_SCHEMA_VERSION,
        worldTime: state.clock,
        recordedAt: stored.recordedAt,
        causation: {
          commandId: stored.commandId,
          commandType: stored.commandType,
          actor: stored.actor,
        },
      } as RecordedEvent;
      state = evolve(state, event);
      history.push({ ...event, worldTime: state.clock });
    }
  }
  return null;
}

/** JSON with sorted keys, so stored (possibly re-parsed) payloads compare by content. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}
