import {
  accept,
  candidateReactions,
  combatantOf,
  pendingCandidates,
  reject,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';

import { combatPremises, refused } from '../refusal.ts';
import {
  answerCounterspell,
  answerDodge,
  answerOpportunity,
  answerRebuke,
  answerReroll,
  answerShield,
} from './answers.ts';
import { finish } from './settle.ts';

/**
 * Answers to a reaction window and its close (docs/adr/0016-reaction-engine.md
 * §1). Each pending candidate answers once, with one of the reactions it may use
 * there (`answers.ts`); when nobody is pending, the window closes and what it
 * held — a cast, a move out of reach, an attack (docs/adr/0046-reactions-beyond-counterspell.md)
 * — goes on in the same command (`settle.ts`). A window that is not open accepts nothing.
 */
type Use = Extract<CombatCommand, { type: 'UseReaction' }>;
type Decline = Extract<CombatCommand, { type: 'DeclineReaction' }>;
type Close = Extract<CombatCommand, { type: 'CloseReactionWindow' }>;

type Found<T> = { readonly ok: true; readonly value: T } | (Decision & { ok: false });

function openWindow(state: WorldState, windowId: string): Found<ReactionWindowRecord> {
  const window = state.reactionWindows.get(windowId);
  return window?.status === 'open'
    ? { ok: true, value: window }
    : reject('REACTION_WINDOW_CLOSED', 'This reaction window is not open');
}

/**
 * A combatant's pending candidacy. Someone outside the encounter gets the
 * same answer as for no window at all: they cannot learn a fight exists.
 */
function pendingAnswer(
  state: WorldState,
  windowId: string,
  combatantId: string,
): Found<ReactionWindowRecord> {
  if (!state.encounter || !combatantOf(state.encounter, combatantId)) {
    return reject('REACTION_WINDOW_CLOSED', 'This reaction window is not open');
  }
  const window = openWindow(state, windowId);
  if (!window.ok) return window;
  const candidate = window.value.candidates.find((c) => c.entityId === combatantId);
  if (!candidate) return reject('NOT_A_CANDIDATE', 'Not a candidate of this reaction window');
  if (candidate.response !== 'pending') {
    return reject('ALREADY_RESPONDED', 'This candidate already answered');
  }
  return window;
}

export function decideUseReaction(context: DecisionContext, command: Use, dice: Dice): Decision {
  const { state } = context;
  const found = pendingAnswer(state, command.windowId, command.combatantId);
  if (!found.ok) return found;
  const window = found.value;
  const encounter = state.encounter;
  if (!encounter) return reject('REACTION_WINDOW_CLOSED', 'This reaction window is not open');
  const candidate = window.candidates.find((c) => c.entityId === command.combatantId);
  if (
    !candidate ||
    !(candidateReactions(candidate) as readonly string[]).includes(command.reaction)
  ) {
    return refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
  }
  switch (command.reaction) {
    case 'counterspell':
      return answerCounterspell(context, command, window, encounter, dice);
    case 'opportunity-attack':
      return answerOpportunity(context, command, window, encounter, dice);
    case 'inspiration-reroll':
      return answerReroll(context, command, window, dice);
    case 'shield':
      return answerShield(context, command, window, encounter, dice);
    case 'uncanny-dodge':
      return answerDodge(context, command, window, encounter, dice);
    case 'hellish-rebuke':
      return answerRebuke(context, command, window, encounter, dice);
  }
}

export function decideDeclineReaction(
  context: DecisionContext,
  command: Decline,
  dice: Dice,
): Decision {
  const { state } = context;
  const found = pendingAnswer(state, command.windowId, command.combatantId);
  if (!found.ok) return found;
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    {
      type: 'ReactionDeclined',
      payload: {
        windowId: found.value.windowId,
        reactorId: command.combatantId,
        trigger: found.value.trigger.kind,
      },
    },
  ];
  const ids = command.resolution?.ids ?? [];
  return accept(
    ...finish(context, command.type, found.value, [command.combatantId], events, dice, ids),
  );
}

/** The DM (or system) closes a window: whoever has not answered expires, and the cast proceeds. */
export function decideCloseReactionWindow(
  context: DecisionContext,
  command: Close,
  dice: Dice,
): Decision {
  const found = openWindow(context.state, command.windowId);
  if (!found.ok) return found;
  const window = found.value;
  const expired = pendingCandidates(window);
  const events: DraftEvent[] =
    expired.length > 0
      ? [{ type: 'ReactionWindowExpired', payload: { windowId: window.windowId, expired } }]
      : [];
  const ids = command.resolution?.ids ?? [];
  return accept(...finish(context, command.type, window, expired, events, dice, ids));
}
