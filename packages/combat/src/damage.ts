import type { Dice, DraftEvent, WorldState } from '@ltw/domain';
import { concentrationSaveDc, d20Test, damageAtZero } from '@ltw/rules';

import {
  has,
  hitPoints,
  saveModifier,
  vitalsEvent,
  withConditions,
  withHitPoints,
  withSheet,
  withoutDeathSaves,
  type Vitals,
} from './vitals.ts';

/**
 * Damage and healing (SRD 5.2.1; docs/adr/0015-combat-engine.md §4). Each
 * function returns the target's new vitals and the events that record the
 * change, so a command can chain several effects on the same creature.
 */
export interface Applied {
  readonly vitals: Vitals;
  readonly events: DraftEvent[];
}

export interface DamageInput {
  readonly sourceId: string;
  readonly amount: number;
  readonly damageType: string;
  readonly rolls: readonly number[];
  readonly critical: boolean;
}

const condition = (
  targetId: string,
  name: 'unconscious' | 'prone',
  applied: boolean,
  cause: string,
): DraftEvent => ({
  type: 'ConditionApplied',
  payload: { targetId, condition: name, applied, cause },
});

const statusDead = (state: WorldState, entityId: string): DraftEvent[] => {
  const from = state.entities.get(entityId)?.status ?? 'active';
  return from === 'dead'
    ? []
    : [{ type: 'EntityStatusChanged', payload: { entityId, from, to: 'dead' } }];
};

/** The Concentration a creature keeps after damage, with the save's record (characters only). */
function concentrationAfterDamage(dice: Dice, v: Vitals, damage: number): Applied {
  if (v.kind !== 'character' || v.sheet.concentration === null || damage <= 0)
    return { vitals: v, events: [] };
  const dc = concentrationSaveDc(damage);
  const modifier = saveModifier(v, 'con');
  const save = d20Test(dice, { modifier, target: dc });
  const record: DraftEvent = {
    type: 'SavingThrowRolled',
    payload: {
      creatureId: v.entityId,
      ability: 'con',
      dc,
      rolls: [...save.rolls],
      modifier,
      total: save.total,
      success: save.success,
      purpose: 'concentration',
    },
  };
  const vitals = save.success ? v : withSheet(v, (sheet) => ({ ...sheet, concentration: null }));
  return { vitals, events: [record] };
}

export function applyDamage(
  state: WorldState,
  dice: Dice,
  target: Vitals,
  input: DamageInput,
): Applied {
  const before = hitPoints(target).current;
  const max = hitPoints(target).max;
  const amount = Math.max(0, input.amount);
  const record: DraftEvent = {
    type: 'DamageApplied',
    payload: {
      targetId: target.entityId,
      sourceId: input.sourceId,
      amount,
      damageType: input.damageType,
      rolls: [...input.rolls],
      hpBefore: before,
      hpAfter: Math.max(0, before - amount),
    },
  };

  // A dying character: damage adds death save failures, or kills outright.
  if (target.kind === 'character' && before === 0) {
    const saves = target.sheet.deathSaves ?? { successes: 0, failures: 0 };
    const result = damageAtZero(saves, amount, max, input.critical);
    const vitals = withSheet(target, (sheet) => ({ ...sheet, deathSaves: result.saves }));
    return {
      vitals,
      events: [
        record,
        vitalsEvent(vitals),
        ...(result.dead ? statusDead(state, target.entityId) : []),
      ],
    };
  }

  const after = Math.max(0, before - amount);
  let vitals = withHitPoints(target, after);
  if (after > 0) {
    const kept = concentrationAfterDamage(dice, vitals, amount);
    return { vitals: kept.vitals, events: [record, ...kept.events, vitalsEvent(kept.vitals)] };
  }
  if (target.kind === 'creature' || amount - before >= max) {
    // Monsters die at 0 HP; a character dies from massive damage (ADR 0015 §4).
    vitals = withSheet(vitals, (sheet) => ({ ...sheet, concentration: null }));
    return { vitals, events: [record, vitalsEvent(vitals), ...statusDead(state, target.entityId)] };
  }
  vitals = withConditions(vitals, ['unconscious', 'prone'], []);
  vitals = withSheet(vitals, (sheet) => ({
    ...sheet,
    concentration: null,
    deathSaves: { successes: 0, failures: 0 },
  }));
  const fell = [
    condition(target.entityId, 'unconscious', true, 'zero-hit-points'),
    ...(has(target, 'prone') ? [] : [condition(target.entityId, 'prone', true, 'zero-hit-points')]),
  ];
  return { vitals, events: [record, ...fell, vitalsEvent(vitals)] };
}

/** Healing up to the maximum; a character at 0 HP regains consciousness but stays Prone. */
export function applyHealing(
  target: Vitals,
  input: { readonly sourceId: string; readonly amount: number; readonly rolls: readonly number[] },
): Applied {
  const { current, max } = hitPoints(target);
  const after = Math.min(max, current + Math.max(0, input.amount));
  let vitals = withHitPoints(target, after);
  const events: DraftEvent[] = [
    {
      type: 'HealingApplied',
      payload: {
        targetId: target.entityId,
        sourceId: input.sourceId,
        amount: after - current,
        rolls: [...input.rolls],
        hpBefore: current,
        hpAfter: after,
      },
    },
  ];
  if (current === 0 && after > 0 && has(target, 'unconscious')) {
    vitals = withConditions(vitals, [], ['unconscious']);
    vitals = withoutDeathSaves(vitals);
    events.push(condition(target.entityId, 'unconscious', false, 'healed'));
  }
  events.push(vitalsEvent(vitals));
  return { vitals, events };
}
