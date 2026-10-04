import type { KernelCommandType } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import type { FactKey } from '../kernel/fact-keys.ts';
import { footprintOf } from '../kernel/facts.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * Reopening a reaction window by undo (docs/adr/0016-reaction-engine.md §3;
 * Gate 03, G03-H01). Undoing the command that closed a window puts the window
 * back, open, before every later command. Each later still-effective command
 * must therefore be one the pause would have accepted: none may have changed
 * a fact the window depends on (exactly the facts its opening read). The
 * commands that did are blockers; undoing them first makes the reopening safe.
 * Undone commands and compensations cancel out and are ignored.
 */
export interface ReopeningBlocker {
  readonly commandId: string;
  readonly commandType: KernelCommandType;
  readonly sequence: number;
}

export function reopeningBlockers(
  state: WorldState,
  history: readonly RecordedEvent[],
  targetEvents: readonly RecordedEvent[],
): ReopeningBlocker[] {
  const depends = new Set<FactKey>();
  for (const event of targetEvents) {
    if (event.type !== 'ReactionWindowResolved') continue;
    const window = state.reactionWindows.get(event.payload.windowId);
    if (!window) continue;
    const opened = footprintOf({ type: 'ReactionWindowOpened', payload: { window } });
    [...opened.reads, ...opened.writes].forEach((fact) => depends.add(fact));
  }
  if (depends.size === 0) return [];
  const after = Math.max(...targetEvents.map((event) => event.sequence));
  const blockers = new Map<string, ReopeningBlocker>();
  for (const event of history) {
    if (event.sequence <= after || event.type === 'CommandUndone') continue;
    const { commandId, commandType } = event.causation;
    if (blockers.has(commandId) || state.commands.get(commandId)?.undoneBy) continue;
    if (footprintOf(event).writes.some((fact) => depends.has(fact))) {
      blockers.set(commandId, { commandId, commandType, sequence: event.sequence });
    }
  }
  return [...blockers.values()];
}
