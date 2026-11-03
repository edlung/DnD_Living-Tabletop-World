import type { ConditionDetails, SpellDamage, SpellDice, SrdSpellMechanics } from '@ltw/contracts';
import {
  combatantOf,
  premisesEvent,
  type CombatantRecord,
  type Dice,
  type DraftEvent,
  type Premise,
  type WorldState,
} from '@ltw/domain';
import {
  COVER_BONUS,
  abilityModifier,
  attackCircumstances,
  hasInvocation,
  repellingBlast,
  sizeRank,
  spellDamageBonus,
  attackRoll,
  conditionBlocked,
  exhaustionPenalty,
  rollDamage,
} from '@ltw/rules';

import { isDodging } from './actions.ts';
import { combatantEvent, coverOf, gapBetween, withTurn } from './battlefield.ts';
import { conditionsAgainst, isHidden, revealed, withDetail } from './condition-details.ts';
import { applyDamage, applyHealing } from './damage.ts';
import type { DataSpellPlan } from './data-spell-plan.ts';
import { fallsAfterHarm, killedIn } from './falling.ts';
import { combatPremiseList } from './refusal.ts';
import { spellSave } from './saves.ts';
import { lostInTheDark } from './sight.ts';
import { savedDamage } from './evasion.ts';
import { pushedEvents, pushedTo } from './masteries.ts';
import { empower, metamagicEffects, transmute } from './metamagic-effects.ts';
import {
  conditionImmune,
  armorClass,
  conditionsOf,
  exhaustionOf,
  hitPoints,
  sizeOf,
  vitalsEvent,
  vitalsOf,
  withAllHitPoints,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * What a spell cast from its data does (docs/adr/0052-spells-as-data.md §2–5): its attacks, saves,
 * damage, healing, temporary hit points and darts, rolled by the server; a spell of the DM's only
 * spends what it costs and is recorded. Also resolves such a cast a reaction window let through.
 */
type Effect = SrdSpellMechanics['effect'];

/** A minute is 10 rounds, an hour 600; a condition the spell brings lasts as the spell does. */
const ROUNDS = { round: 1, minute: 10, hour: 600 } as const;

export function dataSpellEvents(
  state: WorldState,
  casterId: string,
  plan: DataSpellPlan,
  dice: Dice,
): DraftEvent[] {
  const encounter = plan.record ? state.encounter : null;
  const hidden = isHidden(plan.record);
  const sheet = hidden
    ? { ...plan.sheet, conditions: plan.sheet.conditions.filter((c) => c !== 'invisible') }
    : plan.sheet;
  const working = new Map<string, Vitals>([
    [casterId, { kind: 'character', entityId: casterId, sheet }],
  ]);
  const current = (id: string) => working.get(id) ?? vitalsOf(state, id);
  const premises: Premise[] = combatPremiseList(state, casterId);
  if (!encounter)
    for (const target of plan.targets)
      if (target.entityId !== casterId)
        premises.push({ kind: 'perceived', entityId: target.entityId });
  const records = new Map<string, CombatantRecord>();
  const effects: DraftEvent[] = [];
  const harmed = (
    record: CombatantRecord | null,
    applied: { events: readonly DraftEvent[]; vitals: Vitals },
  ) => {
    working.set(applied.vitals.entityId, applied.vitals);
    effects.push(...applied.events);
    if (record) {
      const dead = killedIn(applied.events, record.entityId);
      effects.push(...fallsAfterHarm(state, dice, effects, record, applied.vitals, dead));
    }
  };
  const { effect } = plan.mechanics;
  const spellAbility = abilityModifier(plan.sheet.abilities[plan.cast.source.ability]);
  // Metamagic's changes (docs/adr/0056-characters-from-the-srd.md §4): Empowered once, on the
  // first damage rolled; Seeking once, on the first miss.
  const meta = metamagicEffects(
    plan.metamagic,
    plan.sheet,
    plan.record,
    plan.area.length > 0
      ? plan.area
      : plan.targets.flatMap((one) => (one.record ? [one.record] : [])),
    plan.targets[0]?.entityId ?? null,
  );
  let empowerLeft = meta.empowered;
  let seekingLeft = meta.seeking;
  const damageRoll = (damage: SpellDamage, critical: boolean) => {
    const rolled = roll_(dice, plan, damage, critical);
    if (empowerLeft === 0) return rolled;
    const again = empower(dice, rolled, damage.dice.sides, empowerLeft);
    empowerLeft = 0;
    return again;
  };

  if (effect.kind === 'attack') {
    for (const target of plan.targets) {
      const vitals = current(target.entityId);
      if (!vitals) continue;
      const casterVitals = current(casterId) ?? vitals;
      const circumstances = attackCircumstances({
        attackerConditions:
          encounter && plan.record
            ? conditionsAgainst(state, encounter, plan.record, casterVitals, target.entityId)
            : conditionsOf(casterVitals),
        targetConditions: conditionsOf(vitals),
        melee: effect.attack === 'melee',
        distanceFt:
          plan.record && target.record ? gapBetween(state, plan.record, target.record) : 5,
        longRange: false,
        targetDodging: target.record ? isDodging(target.record, vitals) : false,
        attackerSqueezed: plan.record?.squeezed === true,
        targetSqueezed: target.record?.squeezed === true,
        ...(encounter && plan.record && target.record
          ? {
              targetUnseen: lostInTheDark(state, encounter, plan.record, target.record),
              attackerUnseen: lostInTheDark(state, encounter, target.record, plan.record),
            }
          : {}),
      });
      const ac = armorClass(vitals) + (target.cover === 'none' ? 0 : COVER_BONUS[target.cover]);
      const modifier = plan.cast.attackBonus + exhaustionPenalty(exhaustionOf(casterVitals));
      const options = {
        modifier,
        target: ac,
        advantage: circumstances.advantage,
        disadvantage: circumstances.disadvantage,
      };
      let roll = attackRoll(dice, options);
      if (!roll.success && seekingLeft) {
        seekingLeft = false;
        roll = attackRoll(dice, options);
      }
      const critical = roll.success && (roll.critical || circumstances.criticalOnHit);
      effects.push({
        type: 'AttackPerformed',
        payload: {
          attackerId: casterId,
          targetId: target.entityId,
          attackId: plan.spellId,
          rolls: [...roll.rolls],
          modifier,
          total: roll.total,
          advantage: circumstances.advantage,
          disadvantage: circumstances.disadvantage,
          cover: target.cover,
          critical,
          hit: roll.success,
        },
      });
      if (!roll.success) continue;
      for (const damage of effect.damage) {
        const rolled = damageRoll(damage, critical);
        const latest = current(target.entityId);
        if (!latest) break;
        harmed(
          target.record,
          applyDamage(state, dice, latest, {
            sourceId: casterId,
            amount: rolled.total,
            damageType: transmute(damage.type, meta),
            rolls: rolled.rolls,
            critical,
          }),
        );
      }
      effects.push(...repelled(state, dice, plan, target.entityId, current, records));
    }
  } else if (effect.kind === 'save') {
    // One roll of the damage for every creature it reaches (SRD 5.2.1).
    const rolls = effect.damage.map((damage) => ({
      damage,
      rolled: damageRoll(damage, false),
    }));
    const reached =
      plan.area.length > 0
        ? plan.area
        : plan.targets.flatMap((one) => (one.record ? [one.record] : []));
    const alone = plan.area.length === 0 ? plan.targets.filter((one) => !one.record) : [];
    for (const record of reached) saveOf(record, record.entityId);
    for (const target of alone) saveOf(null, target.entityId);
    function saveOf(record: CombatantRecord | null, entityId: string) {
      if (effect.kind !== 'save') return;
      const vitals = current(entityId);
      if (!vitals) return;
      // Careful Spell: spared, it succeeds and takes no damage a success would halve.
      if (meta.spared.has(entityId)) return;
      const cover = record && encounter ? coverOf(state, encounter, record) : 'none';
      const save = spellSave(
        dice,
        vitals,
        effect.ability,
        plan.cast.saveDc,
        cover === 'total' ? 'none' : cover,
        'spell',
        record ? isDodging(record, vitals) : false,
        record?.squeezed === true,
        // Heightened Spell's Disadvantage.
        meta.heightened === entityId,
      );
      effects.push(save.event);
      for (const { damage, rolled } of rolls) {
        const amount = savedDamage(
          vitals,
          effect.ability,
          effect.onSuccess === 'half' ? 'half' : 'none',
          save.success,
          rolled.total,
        );
        if (amount === 0 && save.success) continue;
        const latest = current(entityId);
        if (!latest) return;
        harmed(
          record,
          applyDamage(state, dice, latest, {
            sourceId: casterId,
            amount,
            damageType: transmute(damage.type, meta),
            rolls: rolled.rolls,
            critical: false,
          }),
        );
      }
      if (!save.success && effect.condition) condition(record, entityId, effect, plan.cast.saveDc);
    }
  } else if (effect.kind === 'heal') {
    for (const target of plan.targets) {
      const vitals = current(target.entityId);
      if (!vitals) continue;
      const rolled = rollDice(dice, effect.dice, plan, effect.modifier ? spellAbility : 0);
      harmed(
        null,
        applyHealing(vitals, { sourceId: casterId, amount: rolled.total, rolls: rolled.rolls }),
      );
    }
  } else if (effect.kind === 'temp-hp') {
    for (const target of plan.targets) {
      const vitals = current(target.entityId);
      if (!vitals) continue;
      // Fiendish Vigor: False Life cast at will gives the dice's highest (§4).
      const vigor =
        plan.cast.atWill &&
        plan.spellId === 'false-life' &&
        hasInvocation(plan.sheet, 'fiendish-vigor');
      const rolled = vigor
        ? { total: effect.dice.count * effect.dice.sides + effect.dice.bonus }
        : rollDice(dice, effect.dice, plan, 0);
      const hp = hitPoints(vitals);
      // Temporary hit points never stack: the higher stays (ADR 0048 §1).
      if ((hp.temporary ?? 0) >= rolled.total) continue;
      const next = withAllHitPoints(vitals, { ...hp, temporary: rolled.total });
      working.set(target.entityId, next);
      effects.push(vitalsEvent(next));
    }
  } else if (effect.kind === 'auto') {
    const rolled = damageRoll(effect.damage, false);
    for (const target of plan.targets) {
      const vitals = current(target.entityId);
      if (!vitals) continue;
      harmed(
        target.record,
        applyDamage(state, dice, vitals, {
          sourceId: casterId,
          amount: rolled.total,
          damageType: transmute(effect.damage.type, meta),
          rolls: rolled.rolls,
          critical: false,
        }),
      );
    }
  }

  /** A condition a failed save brings, lasting as the spell lasts, with its save each turn. */
  function condition(
    record: CombatantRecord | null,
    entityId: string,
    save: Extract<Effect, { kind: 'save' }>,
    dc: number,
  ) {
    const name = save.condition;
    const vitals = current(entityId);
    if (
      !name ||
      !vitals ||
      conditionBlocked(name, conditionsOf(vitals)) ||
      conditionImmune(vitals, name)
    )
      return;
    const next = withConditions(vitals, [name], []);
    working.set(entityId, next);
    effects.push(
      {
        type: 'ConditionApplied',
        payload: { targetId: entityId, condition: name, applied: true, cause: 'spell' },
      },
      vitalsEvent(next),
    );
    if (!record || !encounter) return;
    const { unit, amount } = plan.mechanics.duration;
    const rounds = unit in ROUNDS ? ROUNDS[unit as keyof typeof ROUNDS] * (amount ?? 1) : null;
    const details: ConditionDetails = {
      sourceId: casterId,
      ...(rounds !== null
        ? { until: { turnOf: casterId, at: 'start' as const, turns: Math.min(100, rounds) } }
        : {}),
      ...(save.repeatSave ? { save: { ability: save.ability, dc } } : {}),
      spell: true,
    };
    const base = records.get(entityId) ?? combatantOf(encounter, entityId) ?? record;
    const after = withDetail(base, name, details);
    records.set(entityId, after);
  }

  let record = plan.record ? withTurn(plan.record, plan.turn) : null;
  if (record && hidden) record = withDetail(record, 'invisible', null);
  const events: DraftEvent[] = [
    premisesEvent(casterId, premises),
    {
      type: 'SpellCast',
      payload: {
        casterId,
        spellId: plan.spellId,
        slotLevel: plan.cast.slotLevel,
        free: plan.cast.free,
        targetId: plan.targets[0]?.entityId ?? null,
        point: plan.point ? { ...plan.point } : null,
        ...(plan.targets.length > 1 ? { targetIds: plan.targets.map((one) => one.entityId) } : {}),
        ...(effect.kind === 'dm'
          ? { forDm: 'effect' as const }
          : plan.mechanics.complete
            ? {}
            : { forDm: 'rest' as const }),
      },
    },
    ...(hidden
      ? revealed(casterId, { kind: 'character', entityId: casterId, sheet: plan.sheet })
      : []),
    vitalsEvent({ kind: 'character', entityId: casterId, sheet }),
    ...effects,
    ...[...records.values()].map(combatantEvent),
  ];
  if (record) events.push(combatantEvent(record));
  return events;
}

/** A damage's dice at the cast's slot and the caster's level, its critical doubling the dice. */
function roll_(dice: Dice, plan: DataSpellPlan, damage: SpellDamage, critical: boolean) {
  const { upcast, cantrip } = plan.mechanics;
  const extra =
    upcast?.dice && (upcast.damageType === null || upcast.damageType === damage.type)
      ? upcast.dice.count * plan.above
      : 0;
  const count = damage.dice.count * (cantrip === 'dice' ? plan.tier : 1) + extra;
  // Agonizing Blast's Charisma on each beam (docs/adr/0056-characters-from-the-srd.md §4).
  const bonus = damage.dice.bonus + spellDamageBonus(plan.sheet, plan.spellId);
  return rollDamage(dice, count, damage.dice.sides, bonus, critical);
}

/** Healing's or temporary hit points' dice at the cast's slot, plus a modifier. */
function rollDice(dice: Dice, base: SpellDice, plan: DataSpellPlan, modifier: number) {
  const extra = plan.mechanics.upcast?.dice ? plan.mechanics.upcast.dice.count * plan.above : 0;
  return rollDamage(dice, base.count + extra, base.sides, base.bonus + modifier);
}

/**
 * Repelling Blast (docs/adr/0056-characters-from-the-srd.md §4): an Eldritch Blast beam that hits
 * pushes a Large or smaller creature still standing 10 ft straight away; each beam from where the
 * last left it.
 */
function repelled(
  state: WorldState,
  dice: Dice,
  plan: DataSpellPlan,
  targetId: string,
  current: (id: string) => Vitals | null,
  records: Map<string, CombatantRecord>,
): DraftEvent[] {
  const encounter = state.encounter;
  const struck = current(targetId);
  const record =
    records.get(targetId) ?? (encounter ? combatantOf(encounter, targetId) : undefined);
  if (!encounter || !plan.record || !record || !struck || !repellingBlast(plan.sheet, plan.spellId))
    return [];
  if (hitPoints(struck).current === 0 || sizeRank(sizeOf(struck)) > sizeRank('large')) return [];
  const to = pushedTo(state, encounter, plan.record, record, 10);
  records.set(targetId, { ...record, position: { ...to.square } });
  return pushedEvents(state, dice, record, struck, to);
}
