import type { KernelCommandType } from '@ltw/contracts';
import {
  foldDrafts,
  openReactionWindow,
  pendingCandidates,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';

import { completeSuspended } from './complete.ts';

/**
 * How a window closes (docs/adr/0016-reaction-engine.md §1; docs/adr/0046 §1): once nobody is
 * pending it resolves and what it held goes on — the suspended cast or move, the attack — unless
 * the answer opened a window of its own, inside which it waits. A window that closes inside one
 * that waits lets that one open again, and resolve too when nobody there is pending.
 */
export function finish(
  context: DecisionContext,
  commandType: KernelCommandType,
  window: ReactionWindowRecord,
  answered: readonly string[],
  events: DraftEvent[],
  dice: Dice,
  ids: readonly string[],
  /** What the answer makes of what the window held, instead of letting it go on unchanged. */
  completion?: (state: WorldState) => DraftEvent[],
): DraftEvent[] {
  const inside = events.some(
    (event) =>
      event.type === 'ReactionWindowOpened' &&
      event.payload.window.parentWindowId === window.windowId,
  );
  if (inside) return events;
  if (pendingCandidates(window).some((id) => !answered.includes(id))) return events;
  const closed = [...events, resolved(window)];
  const done = completion
    ? completion(foldDrafts(context, commandType, closed))
    : completeSuspended(context, commandType, closed, window, dice, ids);
  return settle(context, commandType, [...closed, ...done], window, dice, ids);
}

const resolved = (window: ReactionWindowRecord): DraftEvent => ({
  type: 'ReactionWindowResolved',
  payload: { windowId: window.windowId, outcome: 'proceeded' },
});

function settle(
  context: DecisionContext,
  commandType: KernelCommandType,
  events: DraftEvent[],
  closed: ReactionWindowRecord,
  dice: Dice,
  ids: readonly string[],
): DraftEvent[] {
  const parentId = closed.parentWindowId;
  if (parentId === undefined) return events;
  const state = foldDrafts(context, commandType, events);
  // What closed opened a window of its own: the parent waits on.
  if (openReactionWindow(state)) return events;
  const parent = state.reactionWindows.get(parentId);
  if (parent?.status !== 'waiting') return events;
  const resumed: DraftEvent[] = [
    ...events,
    { type: 'ReactionWindowResumed', payload: { windowId: parentId } },
  ];
  if (pendingCandidates(parent).length > 0) return resumed;
  const reopened: ReactionWindowRecord = { ...parent, status: 'open' };
  const ended = [...resumed, resolved(reopened)];
  const done = completeSuspended(context, commandType, ended, reopened, dice, ids);
  return settle(context, commandType, [...ended, ...done], reopened, dice, ids);
}
