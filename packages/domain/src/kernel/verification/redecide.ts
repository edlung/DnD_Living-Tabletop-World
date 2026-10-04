import type { CharacterSheet, Skill } from '@ltw/contracts';

import type { CombatPort } from '../../combat/port.ts';
import { authorize } from '../authorization.ts';
import { decide } from '../decide/decide.ts';
import type { StoredCommand } from '../engine/event-store.ts';
import { schemaVersionOf, writtenEarlier } from '../event-versions.ts';
import type { KernelEvent, RecordedEvent } from '../events.ts';
import { evolve } from '../evolve.ts';
import { EMPTY_WORLD_STATE, type WorldState } from '../state.ts';

/**
 * Independent oracle for dependency-preserving undo (ADR 0006 §8; Gate 02
 * G02-H02/H03). The commands still effective after any sequence of undos
 * must each be authorized and accepted again, with the same events, when
 * re-decided in order from an empty campaign. A dependency missing from any
 * footprint shows up as a command that is no longer legal or decides
 * differently, whatever premises the command recorded. Used by randomized tests and available for audits.
 *
 * A command an earlier writer decided (one of its events carries an earlier
 * schema version than its type is written with now; Gate 03 retest 2,
 * G03-H05) is canon as recorded: the rules that decided it may have changed
 * since, so its recorded events are folded instead of re-decided, and they
 * must still apply to the effective history.
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
  combat?: CombatPort,
): Divergence | null {
  const recorded = new Map<string, RecordedEvent[]>();
  for (const event of original.history) {
    const list = recorded.get(event.causation.commandId) ?? [];
    list.push(event);
    recorded.set(event.causation.commandId, list);
  }
  let state = EMPTY_WORLD_STATE;
  const history: RecordedEvent[] = [];
  const append = (
    stored: StoredCommand,
    drafts: readonly (KernelEvent & { schemaVersion?: number })[],
  ) => {
    for (const draft of drafts) {
      const sequence = state.version + 1;
      const event = {
        type: draft.type,
        payload: draft.payload,
        campaignId: stored.campaignId,
        sequence,
        eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        schemaVersion: draft.schemaVersion ?? schemaVersionOf(draft.type),
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
  };
  for (const stored of log) {
    if (stored.commandType === 'UndoCommand') continue;
    if (original.state.commands.get(stored.commandId)?.undoneBy !== null) continue;
    const where = { commandId: stored.commandId, commandType: stored.commandType };
    const events = recorded.get(stored.commandId) ?? [];
    if (events.some(writtenEarlier)) {
      try {
        append(stored, events);
      } catch (error) {
        return { ...where, reason: `recorded events no longer apply: ${String(error)}` };
      }
      continue;
    }
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
        ...(combat ? { combat } : {}),
      },
      stored.command,
    );
    if (!decision.ok) return { ...where, reason: `no longer accepted: ${decision.rejection.code}` };
    const expected = events.map(({ type, payload }) => ({ type, payload }));
    if (canonical(decision.events) !== canonical(expected)) {
      return { ...where, reason: 'decides differently under current canon' };
    }
    append(stored, decision.events);
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
