import type { KernelCommandOf, Square } from '@ltw/contracts';
import {
  accept,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';
import { gapToSquareFt, inSpellArea, rollDamage, squaresOf } from '@ltw/rules';

import { isDodging } from './actions.ts';
import {
  combatantEvent,
  coverOf,
  encounterOf,
  gapBetween,
  inBounds,
  isAlive,
  onTurn,
  placedOf,
  turnStateOf,
  withTurn,
} from './battlefield.ts';
import type { FightWork } from './condition-details.ts';
import { applyDamage } from './damage.ts';
import { fallsAfterHarm, killedIn } from './falling.ts';
import { isObjectIn } from './objects.ts';
import { combatPremises, refused } from './refusal.ts';
import { spellSave } from './saves.ts';
import { incapacitated, vitalsOf, type Vitals } from './vitals.ts';

/**
 * A creature's action with a save (docs/adr/0053-monsters-as-data.md §2), on its turn and for its
 * action: a breath in a cone or a line toward a square, an area on a point in range, or one
 * creature within its reach. One damage roll for all, each creature saving for half or none; an
 * action with a Recharge is spent until its d6 comes up at the start of the creature's turn, one
 * used so many times a day counts its uses.
 */
export function decideUseCreatureAction(
  context: DecisionContext,
  command: KernelCommandOf<'UseCreatureAction'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const record = current.value;
  const vitals = vitalsOf(state, command.combatantId);
  const action =
    vitals?.kind === 'creature'
      ? vitals.block.saveActions?.find((one) => one.actionId === command.actionId)
      : undefined;
  if (!vitals || !action) return refused({ legal: false, reason: 'NOT_KNOWN' });
  if (incapacitated(vitals)) return refused({ legal: false, reason: 'INCAPACITATED' });
  const turn = turnStateOf(encounter.value, record);
  if (turn.actionUsed) return refused({ legal: false, reason: 'NO_ACTION' });
  if (record.spent?.includes(action.actionId))
    return refused({ legal: false, reason: 'NOT_RECHARGED' });
  const used = record.used?.find((one) => one.actionId === action.actionId)?.count ?? 0;
  if (action.perDay !== null && used >= action.perDay)
    return refused({ legal: false, reason: 'NO_USES_LEFT' });

  let reached: CombatantRecord[];
  let point: Square | null = null;
  if (action.area) {
    if (action.area.shape !== 'emanation') {
      if (!command.point) return refused({ legal: false, reason: 'TARGET_REQUIRED' });
      if (!inBounds(encounter.value, command.point))
        return refused({ legal: false, reason: 'DESTINATION_INVALID' });
      point = command.point;
    }
    const own = squaresOf(placedOf(state, record));
    if (point && action.area.origin === 'point' && action.rangeFt !== null) {
      if (gapToSquareFt(placedOf(state, record), point) > action.rangeFt)
        return refused({ legal: false, reason: 'OUT_OF_RANGE' });
    }
    const shape = action.area;
    reached = encounter.value.combatants.filter(
      (one) =>
        one.entityId !== record.entityId &&
        isAlive(state, one.entityId) &&
        !isObjectIn(state, one.entityId) &&
        squaresOf(placedOf(state, one)).some((square) => inSpellArea(shape, own, point, square)),
    );
  } else {
    const target = command.targetId
      ? encounter.value.combatants.find((one) => one.entityId === command.targetId)
      : undefined;
    if (!target) return refused({ legal: false, reason: 'TARGET_REQUIRED' });
    if (!isAlive(state, target.entityId)) return refused({ legal: false, reason: 'TARGET_DEAD' });
    if (gapBetween(state, record, target) > (action.reachFt ?? 5))
      return refused({ legal: false, reason: 'OUT_OF_RANGE' });
    reached = [target];
  }

  // One roll of each damage for every creature it reaches.
  const rolls = action.damage.map((damage) => ({
    damage,
    rolled: rollDamage(dice, damage.count, damage.sides, damage.bonus),
  }));
  const effects: DraftEvent[] = [];
  const working = new Map<string, Vitals>();
  for (const one of reached) {
    const target = working.get(one.entityId) ?? vitalsOf(state, one.entityId);
    if (!target) continue;
    const cover = coverOf(state, encounter.value, one);
    const save = spellSave(
      dice,
      target,
      action.ability,
      action.dc,
      cover === 'total' ? 'none' : cover,
      'creature-action',
      isDodging(one, target),
      one.squeezed === true,
    );
    effects.push(save.event);
    let latest = target;
    for (const { damage, rolled } of rolls) {
      const amount = !save.success
        ? rolled.total
        : action.onSuccess === 'half'
          ? Math.floor(rolled.total / 2)
          : 0;
      if (amount === 0) continue;
      const applied = applyDamage(state, dice, latest, {
        sourceId: record.entityId,
        amount,
        damageType: damage.type,
        rolls: rolled.rolls,
        critical: false,
      });
      latest = applied.vitals;
      effects.push(...applied.events);
      const dead = killedIn(applied.events, one.entityId);
      effects.push(...fallsAfterHarm(state, dice, effects, one, applied.vitals, dead));
      if (dead) break;
    }
    working.set(one.entityId, latest);
  }

  let next: CombatantRecord = withTurn(record, { ...turn, actionUsed: true });
  if (action.recharge !== null)
    next = { ...next, spent: [...(record.spent ?? []), action.actionId] };
  if (action.perDay !== null) {
    const others = (record.used ?? []).filter((one) => one.actionId !== action.actionId);
    next = { ...next, used: [...others, { actionId: action.actionId, count: used + 1 }] };
  }
  return accept(
    combatPremises(state, command.combatantId),
    {
      type: 'CreatureActionUsed',
      payload: {
        creatureId: record.entityId,
        action: action.actionId,
        point: point ? { ...point } : null,
        targetId: command.targetId ?? null,
      },
    },
    ...effects,
    combatantEvent(next),
  );
}

/** At the start of its turn, each spent action rolls its d6 to come back (ADR 0053 §2). */
export function rechargeAtStart(work: FightWork, dice: Dice, entityId: string): DraftEvent[] {
  const record = work.combatant(entityId);
  const vitals = work.vitalsOf(entityId);
  if (!record?.spent || vitals?.kind !== 'creature') return [];
  const events: DraftEvent[] = [];
  const kept: string[] = [];
  for (const actionId of record.spent) {
    const action = vitals.block.saveActions?.find((one) => one.actionId === actionId);
    if (action?.recharge === null || action?.recharge === undefined) continue;
    const roll = dice.roll(6);
    const recharged = roll >= action.recharge;
    events.push({
      type: 'RechargeRolled',
      payload: { creatureId: entityId, action: actionId, roll, recharged },
    });
    if (!recharged) kept.push(actionId);
  }
  const next = { ...record };
  if (kept.length > 0) next.spent = kept;
  else delete next.spent;
  events.push(work.record(next));
  return events;
}
