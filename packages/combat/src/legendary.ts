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
import { vitalsOf } from './vitals.ts';

/**
 * A legendary action's attack (docs/adr/0053-monsters-as-data.md §4): the DM's, for a creature
 * with legendary actions, off its own turn — after another creature's — with one of its uses this
 * round, which come back at the start of its turn. Only the attacks its legendary actions name.
 */
type Attack = Extract<CombatCommand, { type: 'Attack' }>;

export function decideLegendaryAttack(
  context: DecisionContext,
  command: Attack,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const record = combatantOf(encounter.value, command.combatantId);
  if (!record) return notInCombat();
  const vitals = vitalsOf(state, command.combatantId);
  const legendary = vitals?.kind === 'creature' ? vitals.block.legendary : undefined;
  if (!legendary?.attacks.includes(command.attackId))
    return refused({ legal: false, reason: 'NOT_KNOWN' });
  // After another creature's turn, never on its own.
  if (currentCombatant(encounter.value)?.entityId === command.combatantId)
    return refused({ legal: false, reason: 'NO_VALID_TRIGGER' });
  if ((record.legendaryUsed ?? 0) >= legendary.uses)
    return refused({ legal: false, reason: 'NO_USES_LEFT' });
  const plan = attackPlan(
    state,
    encounter.value,
    command.combatantId,
    command.attackId,
    command.targetId,
    'legendary',
    command.knockOut === undefined ? {} : { knockOut: command.knockOut },
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
      targetId: command.targetId,
      attackId: command.attackId,
      by: 'legendary',
    },
    plan.turn,
    (after) => ({ ...after, legendaryUsed: (after.legendaryUsed ?? 0) + 1 }),
  );
  return accept(
    combatPremises(state, command.combatantId),
    ...events,
    combatantEvent(attacker),
    ...outcome,
  );
}
