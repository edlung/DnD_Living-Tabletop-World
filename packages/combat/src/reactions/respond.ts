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

import { resolveAttack } from '../attack.ts';
import { combatantEvent, withTurn } from '../battlefield.ts';
import { attackPlan } from '../legality.ts';
import { combatPremises, refused } from '../refusal.ts';
import { spellSave } from '../saves.ts';
import { vitalsEvent, vitalsOf } from '../vitals.ts';
import { completeSuspended } from './complete.ts';
import { counterspellPlan } from './eligibility.ts';
import { opportunityPlan } from './opportunity.ts';

/**
 * Answers to a reaction window and its close (docs/adr/0016-reaction-engine.md
 * §1). Each pending candidate answers once, with one of the reactions it may use
 * there; when nobody is pending, the window closes and what it suspended — a
 * cast, or a move out of reach (docs/adr/0046-reactions-beyond-counterspell.md
 * §2) — goes on in the same command. A window that is not open accepts nothing.
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

/** Closes the window as `proceeded` and resolves the suspended cast, unless someone is still pending. */
function closeIfDone(
  context: DecisionContext,
  commandType: 'UseReaction' | 'DeclineReaction' | 'CloseReactionWindow',
  window: ReactionWindowRecord,
  answered: readonly string[],
  events: DraftEvent[],
  dice: Dice,
  ids: readonly string[],
): DraftEvent[] {
  const stillPending = pendingCandidates(window).filter((id) => !answered.includes(id));
  if (stillPending.length > 0) return events;
  const closed: DraftEvent[] = [
    ...events,
    {
      type: 'ReactionWindowResolved',
      payload: { windowId: window.windowId, outcome: 'proceeded' },
    },
  ];
  return [...closed, ...completeSuspended(context, commandType, closed, window, dice, ids)];
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
  if (command.reaction === 'opportunity-attack') {
    return decideOpportunityAttack(context, command, window, dice);
  }
  if (window.trigger.kind !== 'spell') return refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
  const { casterId, components } = window.trigger;
  const plan = counterspellPlan(
    state,
    encounter,
    command.combatantId,
    casterId,
    components,
    command.using,
  );
  if (!plan.legal) return refused(plan);
  const caster = vitalsOf(state, casterId);
  if (!caster) throw new Error(`reaction trigger caster ${casterId} has no vitals`);

  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    {
      type: 'ReactionUsed',
      payload: {
        windowId: window.windowId,
        reactorId: command.combatantId,
        reaction: 'counterspell',
        slotLevel: plan.slotLevel,
      },
    },
    {
      type: 'SpellCast',
      payload: {
        casterId: command.combatantId,
        spellId: 'counterspell',
        slotLevel: plan.slotLevel,
        free: false,
        targetId: casterId,
        point: null,
      },
    },
    vitalsEvent({ kind: 'character', entityId: command.combatantId, sheet: plan.sheet }),
    combatantEvent(withTurn(plan.record, plan.turn)),
  ];
  // The caster's Constitution save against the reactor's spell save DC (ADR 0011).
  const save = spellSave(dice, caster, 'con', plan.saveDc, 'none', 'counterspell');
  events.push(save.event);
  if (!save.success) {
    events.push({
      type: 'ReactionWindowResolved',
      payload: { windowId: window.windowId, outcome: 'countered' },
    });
    return accept(...events);
  }
  const ids = command.resolution?.ids ?? [];
  return accept(
    ...closeIfDone(context, command.type, window, [command.combatantId], events, dice, ids),
  );
}

/**
 * An opportunity attack (ADR 0046 §2): one melee attack against the creature leaving reach, as it
 * stands on the last square inside it, paid with the Reaction and resolved at once.
 */
function decideOpportunityAttack(
  context: DecisionContext,
  command: Use,
  window: ReactionWindowRecord,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = state.encounter;
  if (!encounter || window.trigger.kind !== 'move') {
    return refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
  }
  const { moverId } = window.trigger;
  const reactorId = command.combatantId;
  const allowed = opportunityPlan(state, encounter, reactorId, moverId);
  if (!allowed.legal) return refused(allowed);
  const attackId = command.attackId ?? allowed.attacks[0]?.attackId;
  if (attackId === undefined || !allowed.attacks.some((a) => a.attackId === attackId)) {
    return refused({ legal: false, reason: 'NO_WEAPON' });
  }
  const plan = attackPlan(state, encounter, reactorId, attackId, moverId, 'reaction');
  if (!plan.legal) return refused(plan);
  const { events, attacker } = resolveAttack(
    state,
    encounter,
    dice,
    plan,
    { attackerId: reactorId, targetId: moverId, attackId, by: 'opportunity' },
    plan.turn,
  );
  const answered: DraftEvent[] = [
    combatPremises(state, reactorId),
    {
      type: 'ReactionUsed',
      payload: {
        windowId: window.windowId,
        reactorId,
        reaction: 'opportunity-attack',
        attackId,
      },
    },
    ...events,
    combatantEvent(attacker),
  ];
  const ids = command.resolution?.ids ?? [];
  return accept(...closeIfDone(context, command.type, window, [reactorId], answered, dice, ids));
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
    ...closeIfDone(context, command.type, found.value, [command.combatantId], events, dice, ids),
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
  return accept(...closeIfDone(context, command.type, window, expired, events, dice, ids));
}
