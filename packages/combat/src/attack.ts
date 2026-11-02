import {
  accept,
  combatantOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { attackRoll, rollDamage, type TurnState } from '@ltw/rules';

import { combatantEvent, encounterOf, onTurn, withTurn } from './battlefield.ts';
import { revealed, withDetail } from './condition-details.ts';
import { applyDamage } from './damage.ts';
import { attackPlan, type AttackPlan } from './legality.ts';
import { combatPremises, refused } from './refusal.ts';
import { vitalsEvent, withConditions } from './vitals.ts';

/**
 * `Attack` (docs/adr/0015-combat-engine.md §3): one attack of the Attack
 * action. A Critical Hit doubles every damage die, Hunter's Mark and the
 * Goblin's Advantage die included. Longbow Slow lasts until the start of the
 * attacker's next turn.
 */
type AttackCommand = Extract<CombatCommand, { type: 'Attack' }>;

/** One attack as made: by the Attack action, or as an opportunity or the readied attack (ADR 0046). */
export interface MadeAttack {
  readonly attackerId: string;
  readonly targetId: string;
  readonly attackId: string;
  readonly by?: 'opportunity' | 'readied';
}

/**
 * What a legal attack does, however it is paid: its roll, its damage and the Slow mastery, the
 * Help it spends and the hidden attacker it reveals (ADR 0045 §5). The attacker's record comes back
 * with `turn` and without its hiding, for the caller to finish and record.
 */
export function resolveAttack(
  state: WorldState,
  encounter: EncounterState,
  dice: Dice,
  plan: AttackPlan,
  attack: MadeAttack,
  turn: TurnState,
): { readonly events: DraftEvent[]; readonly attacker: CombatantRecord } {
  const roll = attackRoll(dice, {
    modifier: plan.bonus,
    target: plan.targetAc,
    advantage: plan.advantage,
    disadvantage: plan.disadvantage,
  });
  const hit = roll.success;
  const critical = hit && (roll.critical || plan.criticalOnHit);
  const events: DraftEvent[] = [
    {
      type: 'AttackPerformed',
      payload: {
        attackerId: attack.attackerId,
        targetId: attack.targetId,
        attackId: attack.attackId,
        rolls: [...roll.rolls],
        modifier: plan.bonus,
        total: roll.total,
        advantage: plan.advantage,
        disadvantage: plan.disadvantage,
        cover: plan.cover,
        critical,
        hit,
        ...(attack.by === undefined ? {} : { by: attack.by }),
      },
    },
  ];

  if (hit) {
    const { damage } = plan;
    const parts = [rollDamage(dice, damage.count, damage.sides, damage.bonus, critical)];
    if (plan.advantageDamage && plan.advantage && !plan.disadvantage) {
      const extra = plan.advantageDamage;
      parts.push(rollDamage(dice, extra.count, extra.sides, extra.bonus, critical));
    }
    if (plan.huntersMark) parts.push(rollDamage(dice, 1, 6, 0, critical));
    const applied = applyDamage(state, dice, plan.targetVitals, {
      sourceId: attack.attackerId,
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
            targetId: attack.targetId,
            condition: 'slowed',
            applied: true,
            cause: 'slow-mastery',
          },
        },
        vitalsEvent(withConditions(applied.vitals, ['slowed'], [])),
        combatantEvent({ ...plan.target, slowedBy: attack.attackerId }),
      );
    }
  }

  // Help is spent on this attack; a hidden attacker is found by it (ADR 0045 §5).
  const helper = plan.helpedBy === null ? undefined : combatantOf(encounter, plan.helpedBy);
  if (helper) {
    const helping = { ...helper.turn };
    delete helping.helping;
    events.push(combatantEvent({ ...helper, turn: helping }));
  }
  let attacker = withTurn(plan.attacker, turn);
  if (plan.hidden) {
    events.push(...revealed(attack.attackerId, plan.attackerVitals));
    attacker = withDetail(attacker, 'invisible', null);
  }
  return { events, attacker };
}

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
  const { events, attacker } = resolveAttack(
    state,
    encounter.value,
    dice,
    plan,
    { attackerId: command.combatantId, targetId: command.targetId, attackId: command.attackId },
    { ...plan.turn, attacksRemaining: plan.turn.attacksRemaining - 1 },
  );
  return accept(combatPremises(state, command.combatantId), ...events, combatantEvent(attacker));
}
