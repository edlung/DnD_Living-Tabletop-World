import {
  accept,
  combatantOf,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';
import { attackRoll, rollDamage } from '@ltw/rules';

import { combatantEvent, encounterOf, onTurn, withTurn } from './battlefield.ts';
import { revealed, withDetail } from './condition-details.ts';
import { applyDamage } from './damage.ts';
import { attackPlan } from './legality.ts';
import { combatPremises, refused } from './refusal.ts';
import { vitalsEvent, withConditions } from './vitals.ts';

/**
 * `Attack` (docs/adr/0015-combat-engine.md §3): one attack of the Attack
 * action. A Critical Hit doubles every damage die, Hunter's Mark and the
 * Goblin's Advantage die included. Longbow Slow lasts until the start of the
 * attacker's next turn.
 */
type AttackCommand = Extract<CombatCommand, { type: 'Attack' }>;

export function decideAttack(
  context: DecisionContext,
  command: AttackCommand,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const plan = attackPlan(
    state,
    encounter.value,
    command.combatantId,
    command.attackId,
    command.targetId,
  );
  if (!plan.legal) return refused(plan);

  const roll = attackRoll(dice, {
    modifier: plan.bonus,
    target: plan.targetAc,
    advantage: plan.advantage,
    disadvantage: plan.disadvantage,
  });
  const hit = roll.success;
  const critical = hit && (roll.critical || plan.criticalOnHit);
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    {
      type: 'AttackPerformed',
      payload: {
        attackerId: command.combatantId,
        targetId: command.targetId,
        attackId: command.attackId,
        rolls: [...roll.rolls],
        modifier: plan.bonus,
        total: roll.total,
        advantage: plan.advantage,
        disadvantage: plan.disadvantage,
        cover: plan.cover,
        critical,
        hit,
      },
    },
  ];

  let target = plan.target;
  if (hit) {
    const { damage } = plan;
    const parts = [rollDamage(dice, damage.count, damage.sides, damage.bonus, critical)];
    if (plan.advantageDamage && plan.advantage && !plan.disadvantage) {
      const extra = plan.advantageDamage;
      parts.push(rollDamage(dice, extra.count, extra.sides, extra.bonus, critical));
    }
    if (plan.huntersMark) parts.push(rollDamage(dice, 1, 6, 0, critical));
    const applied = applyDamage(state, dice, plan.targetVitals, {
      sourceId: command.combatantId,
      amount: parts.reduce((total, part) => total + part.total, 0),
      damageType: damage.type,
      rolls: parts.flatMap((part) => part.rolls),
      critical,
    });
    events.push(...applied.events);
    const died = applied.events.some(
      (event) => event.type === 'EntityStatusChanged' && event.payload.to === 'dead',
    );
    if (plan.slow && !died) {
      events.push(
        {
          type: 'ConditionApplied',
          payload: {
            targetId: command.targetId,
            condition: 'slowed',
            applied: true,
            cause: 'slow-mastery',
          },
        },
        vitalsEvent(withConditions(applied.vitals, ['slowed'], [])),
      );
      target = { ...target, slowedBy: command.combatantId };
      events.push(combatantEvent(target));
    }
  }

  // Help is spent on this attack; a hidden attacker is found by it (ADR 0045 §5).
  const helper = plan.helpedBy === null ? undefined : combatantOf(encounter.value, plan.helpedBy);
  if (helper) {
    const turn = { ...helper.turn };
    delete turn.helping;
    events.push(combatantEvent({ ...helper, turn }));
  }
  let attacker = withTurn(plan.attacker, {
    ...plan.turn,
    attacksRemaining: plan.turn.attacksRemaining - 1,
  });
  if (plan.hidden) {
    events.push(...revealed(command.combatantId, plan.attackerVitals));
    attacker = withDetail(attacker, 'invisible', null);
  }
  events.push(combatantEvent(attacker));
  return accept(...events);
}
