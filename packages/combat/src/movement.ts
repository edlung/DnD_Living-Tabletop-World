import type { Square } from '@ltw/contracts';
import {
  REACTION_WINDOW_ID_INDEX,
  accept,
  combatantOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type DraftEvent,
  type EncounterState,
  type ReactionWindowRecord,
  type WorldState,
} from '@ltw/domain';
import { gapFt } from '@ltw/rules';

import { combatantEvent, encounterOf, isAlive, onTurn, placedOf, withTurn } from './battlefield.ts';
import { sourceOf } from './condition-details.ts';
import type { Refusal } from './legality.ts';
import { firstProvocation } from './reactions/opportunity.ts';
import { refused, combatPremises } from './refusal.ts';
import { fitAt, stepCostFt } from './space.ts';
import { dragged, heldBy } from './unarmed.ts';
import {
  has,
  incapacitated,
  speedOf,
  vitalsEvent,
  vitalsOf,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * `MoveCombatant` (docs/adr/0015-combat-engine.md §3): square by square from the current square,
 * its whole space within the battlefield and clear of walls; through an ally's space, an
 * Incapacitated creature's, a Tiny one's or one two sizes apart as Difficult Terrain, never ending
 * in another's; squeezing where a Large or larger creature fits only a size smaller
 * (docs/adr/0049-space-and-movement.md §1–4). Difficult terrain costs double; standing up from
 * Prone costs half Speed. Leaving a hostile creature's reach provokes an opportunity attack
 * (docs/adr/0046-reactions-beyond-counterspell.md §2): the move stops there while the window is
 * open, and goes on after.
 */
type Move = Extract<CombatCommand, { type: 'MoveCombatant' }>;

export interface MovePlan {
  readonly legal: true;
  readonly vitals: Vitals;
  /** Half Speed to stand up from Prone first, or 0. */
  readonly standUpFt: number;
  /** Movement used this turn once the move is made. */
  readonly usedFt: number;
  /** Squeezed into a space a size smaller where the move ends (ADR 0049 §4). */
  readonly squeezed: boolean;
}

/**
 * Whether the combatant on its turn may walk `path` now. Shared by the
 * decision and the DM's monster suggestions (docs/adr/0020-npc-intelligence.md §5).
 */
export function movePlan(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly Square[],
): MovePlan | Refusal {
  const vitals = vitalsOf(state, mover.entityId);
  if (!vitals) return { legal: false, reason: 'NOT_A_COMBATANT' };
  if (!isAlive(state, mover.entityId)) return { legal: false, reason: 'ACTOR_DEAD' };
  if (incapacitated(vitals)) return { legal: false, reason: 'INCAPACITATED' };
  let costFt = 0;
  let squeezed = mover.squeezed === true;
  let from = mover.position;
  for (const [index, square] of path.entries()) {
    const step = Math.max(Math.abs(square.x - from.x), Math.abs(square.y - from.y));
    const fit =
      step === 1 ? fitAt(state, encounter, mover, square, index === path.length - 1) : null;
    if (!fit) return { legal: false, reason: 'INVALID_PATH' };
    costFt += stepCostFt(state, encounter, mover, square, fit);
    squeezed = fit.squeezed;
    from = square;
  }
  // A Frightened creature cannot move closer to the source of its fear, at any step
  // (docs/adr/0045-conditions-and-actions.md §1).
  const fear = has(vitals, 'frightened') ? sourceOf(mover, 'frightened') : null;
  const source = fear === null ? undefined : combatantOf(encounter, fear);
  if (source && isAlive(state, source.entityId)) {
    const its = placedOf(state, source);
    const here = (square: Square) => ({ ...placedOf(state, mover), position: square });
    let distance = gapFt(here(mover.position), its);
    for (const square of path) {
      const next = gapFt(here(square), its);
      if (next < distance) return { legal: false, reason: 'CLOSER_TO_FEAR' };
      distance = next;
    }
  }
  const speed = speedOf(vitals);
  const standUpFt = has(vitals, 'prone') ? Math.floor(speed / 10) * 5 : 0;
  // Dragging a creature it grapples, each foot costs another (docs/adr/0047-weapons.md §3).
  const drag = heldBy(state, encounter, mover.entityId).length > 0 ? 2 : 1;
  const usedFt = mover.turn.movementUsedFt + standUpFt + costFt * drag;
  // Dash adds the Speed once more this turn (docs/adr/0045-conditions-and-actions.md §5).
  if (usedFt > speed + (mover.turn.dashFt ?? 0))
    return { legal: false, reason: 'NOT_ENOUGH_MOVEMENT' };
  return { legal: true, vitals, standUpFt, usedFt, squeezed };
}

export function decideMove(context: DecisionContext, command: Move): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const mover = onTurn(encounter.value, command.combatantId);
  if (!mover.ok) return mover;
  const plan = movePlan(state, encounter.value, mover.value, command.path);
  if (!plan.legal) return refused(plan);
  const ids = command.resolution?.ids ?? [];
  return accept(
    combatPremises(state, command.combatantId),
    ...walk(context, state, encounter.value, mover.value, command.path, ids),
  );
}

/**
 * Walks `path` (legal as a whole) for the mover on its turn: stands it up first if Prone, moves it
 * square by square, and stops on the last square inside a reach it would leave while someone may
 * react — the window opens there with the rest of the path (ADR 0046 §2).
 */
function walk(
  context: DecisionContext,
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly Square[],
  ids: readonly string[],
  offered = false,
): DraftEvent[] {
  const whole = movePlan(state, encounter, mover, path);
  if (!whole.legal) throw new Error(`a walk on an illegal path (${whole.reason})`);
  const events: DraftEvent[] = [];
  if (whole.standUpFt > 0) {
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: mover.entityId,
          condition: 'prone',
          applied: false,
          cause: 'stood-up',
        },
      },
      vitalsEvent(withConditions(whole.vitals, [], ['prone'])),
    );
  }
  const along = new Set(heldBy(state, encounter, mover.entityId).map((c) => c.entityId));
  const stop = firstProvocation(state, encounter, mover, path, offered, along);
  const walked = stop === null ? path : path.slice(0, stop.walked);
  let usedFt = mover.turn.movementUsedFt + whole.standUpFt;
  let squeezed = mover.squeezed === true;
  if (walked.length > 0) {
    const part = movePlan(state, encounter, mover, walked);
    if (!part.legal) throw new Error(`a walked part became illegal (${part.reason})`);
    usedFt = part.usedFt;
    squeezed = part.squeezed;
  }
  const at = walked[walked.length - 1] ?? mover.position;
  // Squeezed where it stands, or whole again (docs/adr/0049-space-and-movement.md §4).
  const moved: CombatantRecord = {
    ...withTurn(mover, { ...mover.turn, movementUsedFt: usedFt }),
    position: { ...at },
  };
  delete moved.squeezed;
  events.push(
    combatantEvent(squeezed ? { ...moved, squeezed: true } : moved),
    // The creature it grapples comes along behind it.
    ...dragged(state, encounter, mover.entityId, [mover.position, ...walked]),
  );
  if (stop === null) return events;
  const windowId = ids[REACTION_WINDOW_ID_INDEX];
  if (windowId === undefined) throw new Error('a provoking move resolved without a window ID');
  const window: ReactionWindowRecord = {
    windowId,
    encounterId: encounter.encounterId,
    round: encounter.round,
    status: 'open',
    trigger: {
      kind: 'move',
      moverId: mover.entityId,
      at: { ...at },
      rest: path.slice(stop.walked),
    },
    candidates: stop.candidates.map(({ entityId }) => ({
      entityId,
      response: 'pending',
      reactions: ['opportunity-attack'],
    })),
    ineligible: stop.ineligible.map((entry) => ({ ...entry })),
    openedBy: context.commandId,
    closedBy: null,
  };
  events.push({ type: 'ReactionWindowOpened', payload: { window } });
  return events;
}

/**
 * After the window of a provoking move: the rest of the path goes on — as far as the mover can
 * still walk it (an attack may have slowed it) — unless it can no longer move: dead, at 0 HP,
 * Incapacitated or at Speed 0, when it stays (ADR 0046 §2). It may stop at the next reach.
 */
export function continueMove(
  context: DecisionContext,
  state: WorldState,
  trigger: Extract<ReactionWindowRecord['trigger'], { kind: 'move' }>,
  ids: readonly string[],
): DraftEvent[] {
  const encounter = state.encounter;
  const mover = encounter ? combatantOf(encounter, trigger.moverId) : undefined;
  if (!encounter || !mover || !isAlive(state, mover.entityId)) return [];
  const vitals = vitalsOf(state, mover.entityId);
  if (!vitals || incapacitated(vitals) || speedOf(vitals) === 0) return [];
  let rest = trigger.rest;
  while (rest.length > 0 && !movePlan(state, encounter, mover, rest).legal)
    rest = rest.slice(0, -1);
  // Its first step was this window's: those it provoked have answered.
  return rest.length === 0 ? [] : walk(context, state, encounter, mover, rest, ids, true);
}
