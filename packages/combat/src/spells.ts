import {
  accept,
  magicDiscoveryEvents,
  premisesEvent,
  reject,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';
import { SPELLS, abilityModifier, rollDamage, rollHealingWord } from '@ltw/rules';

import { combatantEvent, coverAt, withTurn } from './battlefield.ts';
import { applyDamage, applyHealing } from './damage.ts';
import { isSliceSpell } from './legality.ts';
import { decideMonsterSpell } from './monster-spells.ts';
import { suspendCast } from './reactions/suspend.ts';
import { refused } from './refusal.ts';
import { spellSave } from './saves.ts';
import { chooseUsing, characterSpellPlan, type CharacterSpellPlan } from './spell-legality.ts';
import { vitalsEvent, vitalsOf, type Vitals } from './vitals.ts';

/**
 * `CastSpell` (docs/adr/0015-combat-engine.md §3). Character spells use the
 * Rules Engine's casting rules; a creature casts from its stat block. In
 * combat, a cast someone could counter is suspended in a reaction window
 * (docs/adr/0016-reaction-engine.md); Counterspell itself is only an answer.
 */
type Cast = Extract<CombatCommand, { type: 'CastSpell' }>;

export function decideCastSpell(context: DecisionContext, command: Cast, dice: Dice): Decision {
  const { state } = context;
  const caster = state.entities.get(command.combatantId);
  if (!caster) return reject('ENTITY_NOT_FOUND', 'Not found');
  if (caster.kind !== 'character') {
    if (!state.encounter) return refused({ legal: false, reason: 'NOT_IN_COMBAT' });
    return decideMonsterSpell(context, command, dice);
  }
  if (!isSliceSpell(command.spellId)) return refused({ legal: false, reason: 'NOT_KNOWN' });
  if (state.encounter && state.encounter.currentIndex < 0) {
    return refused({ legal: false, reason: 'NOT_YOUR_TURN' });
  }
  const plan = characterSpellPlan(state, command.combatantId, {
    spellId: command.spellId,
    ...(command.using === undefined ? {} : { using: command.using }),
    ...(command.targetId === undefined ? {} : { targetId: command.targetId }),
    ...(command.point === undefined ? {} : { point: command.point }),
  });
  if (!plan.legal) return refused(plan);
  const ids = command.resolution?.ids ?? [];
  const economy = SPELLS[plan.spellId].castingTime;
  if (plan.record && economy !== 'reaction') {
    const suspended = suspendCast(
      context,
      {
        casterId: command.combatantId,
        spellId: plan.spellId,
        components: SPELLS[plan.spellId].components,
        economy,
        using: plan.cast.slotLevel === null ? 'free' : { slotLevel: plan.cast.slotLevel },
        targetId: plan.target?.entityId ?? null,
        point: plan.point ? { ...plan.point } : null,
      },
      ids,
    );
    if (suspended) {
      return accept(premisesEvent(command.combatantId, [{ kind: 'sheet' }]), ...suspended);
    }
  }
  return accept(...castEvents(state, command.combatantId, plan, dice, ids));
}

/**
 * Everything a legal character cast does, from its premises to the caster's
 * updated turn. Also resolves a cast a reaction window let through (ADR 0016),
 * against the state after the window's answers.
 */
export function castEvents(
  state: WorldState,
  casterId: string,
  plan: CharacterSpellPlan,
  dice: Dice,
  ids: readonly string[],
): DraftEvent[] {
  const encounter = state.encounter;
  // Every creature's latest vitals within this command (the caster may be in its own Fireball).
  const working = new Map<string, Vitals>([
    [casterId, { kind: 'character', entityId: casterId, sheet: plan.sheet }],
  ]);
  const current = (id: string) => working.get(id) ?? vitalsOf(state, id);
  const effects: DraftEvent[] = [];
  const premises: Parameters<typeof premisesEvent>[1][number][] = [{ kind: 'sheet' }];
  let record = plan.record ? withTurn(plan.record, plan.turn) : null;

  switch (plan.spellId) {
    case 'healing-word': {
      const target = plan.target ? current(plan.target.entityId) : null;
      if (!encounter && plan.target)
        premises.push({ kind: 'perceived', entityId: plan.target.entityId });
      if (target) {
        const heal = rollHealingWord(
          dice,
          plan.cast.slotLevel ?? 1,
          abilityModifier(plan.sheet.abilities[plan.cast.source.ability]),
        );
        const healed = applyHealing(target, {
          sourceId: casterId,
          amount: heal.total,
          rolls: heal.rolls,
        });
        working.set(target.entityId, healed.vitals);
        effects.push(...healed.events);
      }
      break;
    }
    case 'hunters-mark':
      if (!encounter && plan.target)
        premises.push({ kind: 'perceived', entityId: plan.target.entityId });
      break;
    case 'misty-step':
      if (record && plan.point) record = { ...record, position: { ...plan.point } };
      break;
    case 'fireball': {
      const slotLevel = plan.cast.slotLevel ?? 3;
      const damage = rollDamage(dice, 8 + Math.max(0, slotLevel - 3), 6, 0);
      for (const affected of plan.area) {
        const target = current(affected.entityId);
        if (!target || !encounter) continue;
        const cover = coverAt(encounter, affected.position);
        const save = spellSave(
          dice,
          target,
          'dex',
          plan.cast.saveDc,
          cover === 'total' ? 'none' : cover,
        );
        effects.push(save.event);
        const applied = applyDamage(state, dice, target, {
          sourceId: casterId,
          amount: save.success ? Math.floor(damage.total / 2) : damage.total,
          damageType: 'fire',
          rolls: damage.rolls,
          critical: false,
        });
        working.set(target.entityId, applied.vitals);
        effects.push(...applied.events);
      }
      break;
    }
    case 'detect-magic': {
      const discovered = magicDiscoveryEvents(state, casterId, ids);
      for (const event of discovered) {
        if (event.type === 'EvidenceExamined') {
          premises.push({ kind: 'perceived', entityId: event.payload.entityId });
        }
      }
      effects.push(...discovered);
      break;
    }
    case 'counterspell':
      break;
  }

  const events: DraftEvent[] = [
    premisesEvent(casterId, premises),
    {
      type: 'SpellCast',
      payload: {
        casterId,
        spellId: plan.spellId,
        slotLevel: plan.cast.slotLevel,
        free: plan.cast.slotLevel === null,
        targetId: plan.target?.entityId ?? null,
        point: plan.point ? { ...plan.point } : null,
      },
    },
    vitalsEvent({ kind: 'character', entityId: casterId, sheet: plan.sheet }),
    ...effects,
  ];
  if (record) events.push(combatantEvent(record));
  return events;
}

export { chooseUsing };
