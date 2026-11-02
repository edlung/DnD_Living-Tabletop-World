import type { Square } from '@ltw/contracts';
import {
  accept,
  combatantOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { onGround, pathCostFt, squareDistanceFt } from '@ltw/rules';

import {
  combatantEvent,
  encounterOf,
  inBounds,
  isAlive,
  isDifficult,
  occupant,
  onTurn,
  withTurn,
} from './battlefield.ts';
import { sourceOf } from './condition-details.ts';
import type { Refusal } from './legality.ts';
import { refused, combatPremises } from './refusal.ts';
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
 * `MoveCombatant` (docs/adr/0015-combat-engine.md §3): square by square from
 * the current square, within the battlefield, never through or onto another
 * living combatant; difficult terrain costs double; standing up from Prone
 * costs half Speed. Opportunity attacks are Stage 90.
 */
type Move = Extract<CombatCommand, { type: 'MoveCombatant' }>;

export interface MovePlan {
  readonly legal: true;
  readonly vitals: Vitals;
  /** Half Speed to stand up from Prone first, or 0. */
  readonly standUpFt: number;
  /** Movement used this turn once the move is made. */
  readonly usedFt: number;
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
  for (const square of path) {
    if (!inBounds(encounter, square) || occupant(state, encounter, square, mover.entityId)) {
      return { legal: false, reason: 'INVALID_PATH' };
    }
  }
  // A Frightened creature cannot move closer to the source of its fear, at any step
  // (docs/adr/0045-conditions-and-actions.md §1).
  const fear = has(vitals, 'frightened') ? sourceOf(mover, 'frightened') : null;
  const source = fear === null ? undefined : combatantOf(encounter, fear);
  if (source && isAlive(state, source.entityId)) {
    let distance = squareDistanceFt(mover.position, source.position);
    for (const square of path) {
      const next = squareDistanceFt(square, source.position);
      if (next < distance) return { legal: false, reason: 'CLOSER_TO_FEAR' };
      distance = next;
    }
  }
  const walked = [mover.position, ...path].map(onGround);
  const cost = pathCostFt(walked, (p) => isDifficult(encounter, p));
  if (!cost.valid) return { legal: false, reason: 'INVALID_PATH' };
  const speed = speedOf(vitals);
  const standUpFt = has(vitals, 'prone') ? Math.floor(speed / 10) * 5 : 0;
  const usedFt = mover.turn.movementUsedFt + standUpFt + cost.costFt;
  // Dash adds the Speed once more this turn (docs/adr/0045-conditions-and-actions.md §5).
  if (usedFt > speed + (mover.turn.dashFt ?? 0))
    return { legal: false, reason: 'NOT_ENOUGH_MOVEMENT' };
  return { legal: true, vitals, standUpFt, usedFt };
}

export function decideMove(context: DecisionContext, command: Move): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const mover = onTurn(encounter.value, command.combatantId);
  if (!mover.ok) return mover;
  const plan = movePlan(state, encounter.value, mover.value, command.path);
  if (!plan.legal) return refused(plan);
  const { vitals, standUpFt: standUp, usedFt: used } = plan;

  const events: DraftEvent[] = [combatPremises(state, command.combatantId)];
  if (standUp > 0) {
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: command.combatantId,
          condition: 'prone',
          applied: false,
          cause: 'stood-up',
        },
      },
      vitalsEvent(withConditions(vitals, [], ['prone'])),
    );
  }
  const destination = command.path[command.path.length - 1] ?? mover.value.position;
  events.push(
    combatantEvent({
      ...withTurn(mover.value, { ...mover.value.turn, movementUsedFt: used }),
      position: { ...destination },
    }),
  );
  return accept(...events);
}
