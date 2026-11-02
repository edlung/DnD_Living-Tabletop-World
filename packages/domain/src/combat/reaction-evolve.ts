import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { currentCombatant } from './records.ts';
import { openReactionWindow, triggerActor, type ReactionWindowRecord } from './reactions.ts';

/** Fold cases for reaction window events (docs/adr/0016-reaction-engine.md). */
type EventOf<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

export function applyReactionWindowOpened(
  state: WorldState,
  event: EventOf<'ReactionWindowOpened'>,
): WorldState {
  const { window } = event.payload;
  const encounter = state.encounter;
  if (!encounter || encounter.encounterId !== window.encounterId) {
    throw new CorruptHistoryError('reaction window outside its encounter');
  }
  if (openReactionWindow(state)) throw new CorruptHistoryError('two reaction windows open');
  if (state.usedIds.has(window.windowId))
    throw new CorruptHistoryError('reaction window ID reused');
  if (window.status !== 'open' || window.closedBy !== null) {
    throw new CorruptHistoryError('a reaction window opens open');
  }
  if (
    window.parentWindowId !== undefined &&
    state.reactionWindows.get(window.parentWindowId)?.status !== 'waiting'
  ) {
    throw new CorruptHistoryError('a reaction window opened over one that does not wait');
  }
  // A spell is cast and a creature moves on its own turn (ADR 0016, ADR 0046 §2); an attack or
  // its damage may come on anyone's (an opportunity attack, a readied one).
  const actor = triggerActor(window.trigger);
  const ownTurn = window.trigger.kind === 'spell' || window.trigger.kind === 'move';
  if (ownTurn && currentCombatant(encounter)?.entityId !== actor) {
    throw new CorruptHistoryError('a reaction trigger outside its actor’s turn');
  }
  const combatants = new Set(encounter.combatants.map((c) => c.entityId));
  const candidates = window.candidates.map((c) => c.entityId);
  if (
    window.candidates.some((c) => c.response !== 'pending') ||
    new Set(candidates).size !== candidates.length ||
    (ownTurn && candidates.includes(actor)) ||
    !candidates.every((id) => combatants.has(id))
  ) {
    throw new CorruptHistoryError('invalid reaction candidates');
  }
  return {
    ...state,
    reactionWindows: withEntry(state.reactionWindows, window.windowId, structuredClone(window)),
    usedIds: new Set(state.usedIds).add(window.windowId),
  };
}

function requireOpen(state: WorldState, windowId: string): ReactionWindowRecord {
  const window = state.reactionWindows.get(windowId);
  if (window?.status !== 'open')
    throw new CorruptHistoryError('answer to a closed reaction window');
  return window;
}

function answered(
  state: WorldState,
  windowId: string,
  ids: readonly string[],
  response: 'used' | 'declined' | 'expired',
): WorldState {
  const window = requireOpen(state, windowId);
  for (const id of ids) {
    if (window.candidates.find((c) => c.entityId === id)?.response !== 'pending') {
      throw new CorruptHistoryError('answer from a non-pending reaction candidate');
    }
  }
  const candidates = window.candidates.map((c) =>
    ids.includes(c.entityId) ? { ...c, response } : c,
  );
  return {
    ...state,
    reactionWindows: withEntry(state.reactionWindows, windowId, { ...window, candidates }),
  };
}

export const applyReactionUsed = (state: WorldState, event: EventOf<'ReactionUsed'>) =>
  answered(state, event.payload.windowId, [event.payload.reactorId], 'used');

export const applyReactionDeclined = (state: WorldState, event: EventOf<'ReactionDeclined'>) =>
  answered(state, event.payload.windowId, [event.payload.reactorId], 'declined');

export const applyReactionWindowExpired = (
  state: WorldState,
  event: EventOf<'ReactionWindowExpired'>,
) => answered(state, event.payload.windowId, event.payload.expired, 'expired');

/** Closes the window; anyone still pending did not answer in time. */
export function applyReactionWindowResolved(
  state: WorldState,
  event: EventOf<'ReactionWindowResolved'>,
): WorldState {
  const window = requireOpen(state, event.payload.windowId);
  const closed: ReactionWindowRecord = {
    ...window,
    status: event.payload.outcome,
    candidates: window.candidates.map((c) =>
      c.response === 'pending' ? { ...c, response: 'expired' } : c,
    ),
    closedBy: event.causation.commandId,
  };
  return {
    ...state,
    reactionWindows: withEntry(state.reactionWindows, window.windowId, closed),
  };
}

/** The window waits while one its answer opened is open (ADR 0046 §1). */
export function applyReactionWindowWaiting(
  state: WorldState,
  event: EventOf<'ReactionWindowWaiting'>,
): WorldState {
  const window = requireOpen(state, event.payload.windowId);
  return {
    ...state,
    reactionWindows: withEntry(state.reactionWindows, window.windowId, {
      ...window,
      status: 'waiting',
    }),
  };
}

/** It opens again once that one has closed. */
export function applyReactionWindowResumed(
  state: WorldState,
  event: EventOf<'ReactionWindowResumed'>,
): WorldState {
  const window = state.reactionWindows.get(event.payload.windowId);
  if (window?.status !== 'waiting') throw new CorruptHistoryError('a resumed window did not wait');
  if (openReactionWindow(state)) throw new CorruptHistoryError('two reaction windows open');
  return {
    ...state,
    reactionWindows: withEntry(state.reactionWindows, window.windowId, {
      ...window,
      status: 'open',
    }),
  };
}

type ReactionRestore = Extract<Restore, { fact: 'reactionWindow' }>;

export function applyReactionRestore(state: WorldState, restore: ReactionRestore): WorldState {
  return {
    ...state,
    reactionWindows:
      restore.value === null
        ? withoutEntry(state.reactionWindows, restore.windowId)
        : withEntry(state.reactionWindows, restore.windowId, structuredClone(restore.value)),
  };
}
