import type { KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  premisesEvent,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';

import { combatantEvent } from './battlefield.ts';
import { applyDamage, applyHealing } from './damage.ts';
import { has, hitPoints, vitalsEvent, vitalsOf, withConditions, withSheet } from './vitals.ts';

/**
 * The DM's hand (docs/adr/0043-dm-screen.md §1): damage or healing, a condition, Heroic
 * Inspiration — on a character or a creature, in a fight or not — through the same rules a fight
 * uses: dying and death saves, massive damage, a Concentration save, regaining consciousness.
 * The DM's reason stays with the stored command for the DM's history; the narrative record of a
 * change of hit points is the DM's (`HitPointsAdjusted`), never a creature's attack.
 *
 * Each decision reads the target's vitals (a premise), so undoing an earlier change of the same
 * creature after this one is refused as unsafe instead of silently wiping this one.
 */
type Target =
  | { readonly ok: true; readonly vitals: NonNullable<ReturnType<typeof vitalsOf>> }
  | { readonly ok: false; readonly decision: Decision };

function living(state: WorldState, entityId: string): Target {
  const entity = state.entities.get(entityId);
  if (!entity) return { ok: false, decision: reject('ENTITY_NOT_FOUND', 'No such creature') };
  if (entity.status !== 'active')
    return { ok: false, decision: reject('TARGET_DEAD', 'TARGET_DEAD') };
  const vitals = vitalsOf(state, entityId);
  if (!vitals)
    return { ok: false, decision: reject('NO_STAT_BLOCK', 'It has no sheet or stat block') };
  return { ok: true, vitals };
}

const readsVitals = (entityId: string): DraftEvent =>
  premisesEvent(entityId, [{ kind: 'vitals', entityId }]);

export function decideAdjustHitPoints(
  context: DecisionContext,
  command: KernelCommandOf<'AdjustHitPoints'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const before = hitPoints(target.vitals).current;
  if (command.change === 'damage') {
    if (command.damageType === undefined) return reject('INVALID_COMMAND', 'Damage names its type');
    const applied = applyDamage(state, dice, target.vitals, {
      sourceId: command.targetId,
      amount: command.amount,
      damageType: command.damageType,
      rolls: [],
      critical: false,
    });
    // The pipeline's first record is a creature's DamageApplied: the DM's own replaces it.
    const [, ...effects] = applied.events;
    return accept(
      readsVitals(command.targetId),
      {
        type: 'HitPointsAdjusted',
        payload: {
          targetId: command.targetId,
          change: 'damage',
          amount: command.amount,
          damageType: command.damageType,
          hpBefore: before,
          hpAfter: hitPoints(applied.vitals).current,
        },
      },
      ...effects,
    );
  }
  if (command.damageType !== undefined)
    return reject('INVALID_COMMAND', 'Healing has no damage type');
  if (before === hitPoints(target.vitals).max) return reject('NO_EFFECT', 'Already at full health');
  const applied = applyHealing(target.vitals, {
    sourceId: command.targetId,
    amount: command.amount,
    rolls: [],
  });
  const [, ...effects] = applied.events;
  return accept(
    readsVitals(command.targetId),
    {
      type: 'HitPointsAdjusted',
      payload: {
        targetId: command.targetId,
        change: 'healing',
        amount: hitPoints(applied.vitals).current - before,
        hpBefore: before,
        hpAfter: hitPoints(applied.vitals).current,
      },
    },
    ...effects,
  );
}

export function decideSetCondition(
  context: DecisionContext,
  command: KernelCommandOf<'SetCondition'>,
): Decision {
  const { state } = context;
  const target = living(state, command.targetId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  const { condition, applied } = command;
  if (has(vitals, condition) === applied) return reject('NO_EFFECT', 'Nothing changes');
  // A creature at 0 hit points stays Unconscious until it is healed or stabilised by its rules.
  if (condition === 'unconscious' && !applied && hitPoints(vitals).current === 0)
    return reject('ILLEGAL_ACTION', 'AT_ZERO_HIT_POINTS', { reason: 'AT_ZERO_HIT_POINTS' });
  const record = (name: typeof condition): DraftEvent => ({
    type: 'ConditionApplied',
    payload: { targetId: command.targetId, condition: name, applied, cause: 'dm' },
  });
  const events: DraftEvent[] = [readsVitals(command.targetId), record(condition)];
  let next = applied
    ? withConditions(vitals, [condition], [])
    : withConditions(vitals, [], [condition]);
  // Unconscious brings Prone with it (SRD 5.2.1), as falling to 0 hit points does.
  if (condition === 'unconscious' && applied && !has(vitals, 'prone')) {
    next = withConditions(next, ['prone'], []);
    events.push(record('prone'));
  }
  events.push(vitalsEvent(next));
  // Slowed by hand has no slowing creature; lifted by hand, it no longer waits for one's turn.
  const combatant = state.encounter?.combatants.find((c) => c.entityId === command.targetId);
  if (condition === 'slowed' && !applied && combatant && combatant.slowedBy !== null) {
    events.push(combatantEvent({ ...combatant, slowedBy: null }));
  }
  return accept(...events);
}

export function decideSetInspiration(
  context: DecisionContext,
  command: KernelCommandOf<'SetInspiration'>,
): Decision {
  const { state } = context;
  const target = living(state, command.characterId);
  if (!target.ok) return target.decision;
  const { vitals } = target;
  if (vitals.kind !== 'character')
    return reject('INVALID_COMMAND', 'Heroic Inspiration is a character’s');
  if ((vitals.sheet.heroicInspiration === true) === command.inspired)
    return reject('NO_EFFECT', 'Nothing changes');
  const next = withSheet(vitals, (sheet) => {
    if (command.inspired) return { ...sheet, heroicInspiration: true };
    // None held: the field is absent, as on a sheet that never had it.
    const without = { ...sheet };
    delete without.heroicInspiration;
    return without;
  });
  return accept(readsVitals(command.characterId), vitalsEvent(next));
}
