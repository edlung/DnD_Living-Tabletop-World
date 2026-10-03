import {
  accept,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type DraftEvent,
} from '@ltw/domain';
import { onGround, pathCostFt } from '@ltw/rules';

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
import { refused, combatPremises } from './refusal.ts';
import { has, incapacitated, speedOf, vitalsEvent, vitalsOf, withConditions } from './vitals.ts';

/**
 * `MoveCombatant` (docs/adr/0015-combat-engine.md §3): square by square from
 * the current square, within the battlefield, never through or onto another
 * living combatant; difficult terrain costs double; standing up from Prone
 * costs half Speed. Opportunity attacks are Stage 90.
 */
type Move = Extract<CombatCommand, { type: 'MoveCombatant' }>;

export function decideMove(context: DecisionContext, command: Move): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const mover = onTurn(encounter.value, command.combatantId);
  if (!mover.ok) return mover;
  const vitals = vitalsOf(state, command.combatantId);
  if (!vitals) return refused({ legal: false, reason: 'NOT_A_COMBATANT' });
  if (!isAlive(state, command.combatantId)) return refused({ legal: false, reason: 'ACTOR_DEAD' });
  if (incapacitated(vitals)) return refused({ legal: false, reason: 'INCAPACITATED' });
  for (const square of command.path) {
    if (
      !inBounds(encounter.value, square) ||
      occupant(state, encounter.value, square, command.combatantId)
    ) {
      return refused({ legal: false, reason: 'INVALID_PATH' });
    }
  }
  const path = [mover.value.position, ...command.path].map(onGround);
  const cost = pathCostFt(path, (p) => isDifficult(encounter.value, p));
  if (!cost.valid) return refused({ legal: false, reason: 'INVALID_PATH' });
  const speed = speedOf(vitals);
  const standUp = has(vitals, 'prone') ? Math.floor(speed / 10) * 5 : 0;
  const used = mover.value.turn.movementUsedFt + standUp + cost.costFt;
  if (used > speed) return refused({ legal: false, reason: 'NOT_ENOUGH_MOVEMENT' });

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
