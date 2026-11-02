import {
  accept,
  combatantOf,
  currentCombatant,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
} from '@ltw/domain';

import { resolveAttack } from './attack.ts';
import { combatantEvent, encounterOf, notInCombat } from './battlefield.ts';
import { attackPlan } from './legality.ts';
import { combatPremises, refused } from './refusal.ts';

/**
 * The readied attack (docs/adr/0046-reactions-beyond-counterspell.md §5): its holder takes its
 * Reaction to make the attack it readied (ADR 0045 §5) against the creature it named, when its
 * player or the DM judges the trigger has come — any time outside its own turn until its next
 * turn starts. The trigger is the player's words; the rules check the rest as for any attack.
 */
type Readied = Extract<CombatCommand, { type: 'MakeReadiedAttack' }>;

export function decideMakeReadiedAttack(
  context: DecisionContext,
  command: Readied,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const record = combatantOf(encounter.value, command.combatantId);
  if (!record) return notInCombat();
  const readied = record.turn.readied;
  // Nothing held, or its own turn (the trigger comes on another's).
  if (!readied || currentCombatant(encounter.value)?.entityId === command.combatantId) {
    return refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
  }
  const plan = attackPlan(
    state,
    encounter.value,
    command.combatantId,
    readied.attackId,
    readied.targetId,
    'reaction',
  );
  if (!plan.legal) return refused(plan);
  const { events, attacker, outcome } = resolveAttack(
    context,
    state,
    encounter.value,
    dice,
    command.resolution?.ids ?? [],
    plan,
    {
      attackerId: command.combatantId,
      targetId: readied.targetId,
      attackId: readied.attackId,
      by: 'readied',
    },
    plan.turn,
  );
  const turn = { ...attacker.turn };
  delete turn.readied;
  return accept(
    combatPremises(state, command.combatantId),
    ...events,
    combatantEvent({ ...attacker, turn }),
    ...outcome,
  );
}
