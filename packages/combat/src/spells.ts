import {
  accept,
  combatantOf,
  magicDiscoveryEvents,
  magicSensingPremises,
  premisesEvent,
  reject,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type Premise,
  type WorldState,
} from '@ltw/domain';
import {
  DETECT_MAGIC_RADIUS_FT,
  SPELLS,
  abilityModifier,
  rollDamage,
  rollHealingWord,
} from '@ltw/rules';

import { combatantEvent, coverOf, gapBetween, withTurn } from './battlefield.ts';
import { isDodging } from './actions.ts';
import { isHidden, withDetail } from './condition-details.ts';
import { applyDamage, applyHealing } from './damage.ts';
import { isSliceSpell } from './legality.ts';
import { decideMonsterSpell } from './monster-spells.ts';
import { suspendCast } from './reactions/suspend.ts';
import { combatPremiseList, combatPremises, refused } from './refusal.ts';
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
      return accept(combatPremises(state, command.combatantId), ...suspended);
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
  // In combat only when the caster takes part, exactly as the plan decided its
  // legality; an encounter the caster is not in changes nothing (G03-H04).
  const encounter = plan.record ? state.encounter : null;
  // Every creature's latest vitals within this command (the caster may be in its own Fireball).
  // A hidden caster is found by casting (docs/adr/0045-conditions-and-actions.md §5).
  const hidden = isHidden(plan.record);
  const sheet = hidden
    ? { ...plan.sheet, conditions: plan.sheet.conditions.filter((c) => c !== 'invisible') }
    : plan.sheet;
  const working = new Map<string, Vitals>([
    [casterId, { kind: 'character', entityId: casterId, sheet }],
  ]);
  const current = (id: string) => working.get(id) ?? vitalsOf(state, id);
  const effects: DraftEvent[] = [];
  // In combat every combatant may matter; outside it, the caster's sheet and the target.
  const premises: Premise[] = combatPremiseList(state, casterId);
  if (!encounter && plan.target) premises.push({ kind: 'vitals', entityId: plan.target.entityId });
  let record = plan.record ? withTurn(plan.record, plan.turn) : null;
  if (record && hidden) record = withDetail(record, 'invisible', null);

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
        const cover = coverOf(state, encounter, affected);
        const save = spellSave(
          dice,
          target,
          'dex',
          plan.cast.saveDc,
          cover === 'total' ? 'none' : cover,
          'spell',
          isDodging(combatantOf(encounter, affected.entityId), target),
          affected.squeezed === true,
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
      // In combat only combatants within 30 ft; without a battlefield square,
      // nothing is within a measurable 30 ft (Gate 03, G03-H03; owner decision).
      const caster = encounter && plan.record ? plan.record : null;
      const sensed = (entityId: string) => {
        if (!encounter || !caster) return true;
        const other = combatantOf(encounter, entityId);
        return other !== undefined && gapBetween(state, caster, other) <= DETECT_MAGIC_RADIUS_FT;
      };
      const discovered = magicDiscoveryEvents(state, casterId, ids, sensed);
      premises.push(...magicSensingPremises(state, casterId, sensed));
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
    ...(hidden
      ? [
          {
            type: 'ConditionApplied',
            payload: {
              targetId: casterId,
              condition: 'invisible',
              applied: false,
              cause: 'revealed',
            },
          } as const,
        ]
      : []),
    vitalsEvent({ kind: 'character', entityId: casterId, sheet }),
    ...effects,
  ];
  if (record) events.push(combatantEvent(record));
  return events;
}

export { chooseUsing };
