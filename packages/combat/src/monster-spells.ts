import {
  accept,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';
import { COVER_BONUS, attackCircumstances, attackRoll, rollDamage } from '@ltw/rules';

import { combatantEvent, encounterOf, onTurn, withTurn } from './battlefield.ts';
import { applyDamage } from './damage.ts';
import { combatPremises, refused } from './refusal.ts';
import { spellSave } from './saves.ts';
import { monsterSpellPlan } from './spell-legality.ts';
import { armorClass, conditionsOf } from './vitals.ts';

/**
 * A creature's stat-block spell (docs/adr/0015-combat-engine.md §3): a spell
 * attack or a saving throw, no slots, recorded as a free cast. The Goblin
 * Shaman's Ashen Bolt and Binding Hex are the slice's examples.
 */
type Cast = Extract<CombatCommand, { type: 'CastSpell' }>;

export function decideMonsterSpell(context: DecisionContext, command: Cast, dice: Dice): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const plan = monsterSpellPlan(
    state,
    encounter.value,
    command.combatantId,
    command.spellId,
    command.targetId,
  );
  if (!plan.legal) return refused(plan);

  const { spell, target } = plan;
  const events: DraftEvent[] = [
    combatPremises(state, command.combatantId),
    {
      type: 'SpellCast',
      payload: {
        casterId: command.combatantId,
        spellId: spell.spellId,
        slotLevel: null,
        free: true,
        targetId: target.entityId,
        point: null,
      },
    },
  ];
  const { effect } = spell;
  let amount = 0;
  let critical = false;
  let rolls: readonly number[] = [];
  if (effect.kind === 'attack') {
    const circumstances = attackCircumstances({
      attackerConditions: conditionsOf(plan.caster),
      targetConditions: conditionsOf(target.vitals),
      melee: false,
      distanceFt: plan.distanceFt,
      longRange: false,
    });
    const targetAc =
      armorClass(target.vitals) + (target.cover === 'none' ? 0 : COVER_BONUS[target.cover]);
    const roll = attackRoll(dice, {
      modifier: effect.bonus,
      target: targetAc,
      advantage: circumstances.advantage,
      disadvantage: circumstances.disadvantage,
    });
    critical = roll.success && (roll.critical || circumstances.criticalOnHit);
    events.push({
      type: 'AttackPerformed',
      payload: {
        attackerId: command.combatantId,
        targetId: target.entityId,
        attackId: spell.spellId,
        rolls: [...roll.rolls],
        modifier: effect.bonus,
        total: roll.total,
        advantage: circumstances.advantage,
        disadvantage: circumstances.disadvantage,
        cover: target.cover,
        critical,
        hit: roll.success,
      },
    });
    if (roll.success) {
      const damage = rollDamage(
        dice,
        effect.damage.count,
        effect.damage.sides,
        effect.damage.bonus,
        critical,
      );
      amount = damage.total;
      rolls = damage.rolls;
    }
  } else {
    const save = spellSave(dice, target.vitals, effect.ability, effect.dc, target.cover);
    events.push(save.event);
    const damage = rollDamage(dice, effect.damage.count, effect.damage.sides, effect.damage.bonus);
    rolls = damage.rolls;
    amount = !save.success ? damage.total : effect.halfOnSuccess ? Math.floor(damage.total / 2) : 0;
  }
  if (rolls.length > 0) {
    const applied = applyDamage(state, dice, target.vitals, {
      sourceId: command.combatantId,
      amount,
      damageType: effect.damage.type,
      rolls,
      critical,
    });
    events.push(...applied.events);
  }
  events.push(combatantEvent(withTurn(plan.record, plan.turn)));
  return accept(...events);
}
