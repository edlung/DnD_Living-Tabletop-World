import type { CombatantRecord, Dice, DraftEvent, WorldState } from '@ltw/domain';
import { fallDice, rollDamage } from '@ltw/rules';

import { rollSkill } from './actions.ts';
import { combatantEvent, isAlive } from './battlefield.ts';
import type { FightWork } from './condition-details.ts';
import type { Faller } from './reactions/fall-window.ts';
import { applyDamage, type Applied } from './damage.ts';
import {
  conditionImmune,
  has,
  incapacitated,
  speedOf,
  speedsOf,
  vitalsEvent,
  withConditions,
  type Vitals,
} from './vitals.ts';

/**
 * Falling (SRD 5.2.1; docs/adr/0049-space-and-movement.md §6–8): 1d6 Bludgeoning per 10 ft, at
 * most 20d6, through the damage rules — resistances, temporary hit points, 0 hit points — and
 * Prone unless the fall dealt no damage. A long jump landing in Difficult Terrain asks a DC 10
 * Dexterity (Acrobatics) check, Prone on a failure. A flyer that is Prone, Incapacitated or at
 * Speed 0 falls unless it hovers.
 */
const prone = (targetId: string, cause: string): DraftEvent => ({
  type: 'ConditionApplied',
  payload: { targetId, condition: 'prone', applied: true, cause },
});

export function fallEvents(state: WorldState, dice: Dice, target: Vitals, feet: number): Applied {
  const count = fallDice(feet);
  if (count === 0) return { vitals: target, events: [] };
  const damage = rollDamage(dice, count, 6, 0);
  const applied = applyDamage(state, dice, target, {
    sourceId: target.entityId,
    amount: damage.total,
    damageType: 'bludgeoning',
    rolls: damage.rolls,
    critical: false,
    fallFt: feet,
  });
  const dealt = applied.events.some(
    (event) => event.type === 'DamageApplied' && (event.payload as { amount: number }).amount > 0,
  );
  // At 0 hit points it lies Prone already; a creature it killed is past caring.
  if (
    !dealt ||
    has(applied.vitals, 'prone') ||
    conditionImmune(applied.vitals, 'prone') ||
    !isAlive(state, target.entityId)
  )
    return applied;
  const down = withConditions(applied.vitals, ['prone'], []);
  return {
    vitals: down,
    events: [...applied.events, prone(target.entityId, 'fell'), vitalsEvent(down)],
  };
}

/** Whether these events record the creature's death. */
export const killedIn = (events: readonly DraftEvent[], entityId: string): boolean =>
  events.some(
    (event) => event.type === 'EntityStatusChanged' && event.payload.entityId === entityId,
  );

/** A long jump's landing in Difficult Terrain: DC 10 Dexterity (Acrobatics), or Prone (§7). */
export function landingEvents(dice: Dice, target: Vitals): Applied {
  const check = rollSkill(dice, target, 'acrobatics', 10);
  const events: DraftEvent[] = [
    {
      type: 'CheckRolled',
      payload: {
        creatureId: target.entityId,
        skill: 'acrobatics',
        dc: 10,
        rolls: [...check.rolls],
        modifier: check.modifier,
        total: check.total,
        success: check.success,
        purpose: 'landing',
      },
    },
  ];
  if (check.success || has(target, 'prone') || conditionImmune(target, 'prone'))
    return { vitals: target, events };
  const down = withConditions(target, ['prone'], []);
  return {
    vitals: down,
    events: [...events, prone(target.entityId, 'landing'), vitalsEvent(down)],
  };
}

/** A flyer that can no longer stay aloft (§6): Prone, Incapacitated or at Speed 0, not hovering. */
export const grounded = (vitals: Vitals): boolean =>
  speedsOf(vitals).hover !== true &&
  (has(vitals, 'prone') || incapacitated(vitals) || speedOf(vitals) === 0);

/** Every flyer in the fight that can no longer stay aloft falls to the ground beneath it. */
export function gravitySweep(work: FightWork, state: WorldState, dice: Dice): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const record of [...work.combatants]) {
    const height = record.altitudeFt ?? 0;
    if (height <= 0) continue;
    const vitals = work.vitalsOf(record.entityId);
    if (!vitals) continue;
    const dead = !isAlive(state, record.entityId);
    if (!dead && !grounded(vitals)) continue;
    const landed = { ...record };
    delete landed.altitudeFt;
    events.push(work.record(landed));
    if (dead) continue;
    const fell = fallEvents(state, dice, vitals, height);
    // Its events carry the new vitals already; the work only learns them.
    events.push(...fell.events);
    work.vitals(fell.vitals);
  }
  return events;
}

/**
 * A flyer harm leaves unable to stay aloft — dead, Prone (Topple's too), Incapacitated, at Speed
 * 0 — falls at once (§6); the dead without damage. Its latest record is the last `events` wrote.
 */
export function fallsAfterHarm(
  state: WorldState,
  dice: Dice,
  events: readonly DraftEvent[],
  target: CombatantRecord,
  vitals: Vitals,
  dead: boolean,
  /** Its fall, left for the hit's fall moment (§8); absent: it lands now. */
  falls?: Faller[],
): DraftEvent[] {
  const latest =
    events
      .map((event) => (event.type === 'CombatantUpdated' ? event.payload.combatant : null))
      .filter((record) => record?.entityId === target.entityId)
      .at(-1) ?? target;
  const height = latest.altitudeFt ?? 0;
  const toppled = events.some(
    (event) =>
      event.type === 'ConditionApplied' &&
      event.payload.targetId === target.entityId &&
      event.payload.condition === 'prone' &&
      event.payload.applied,
  );
  const now = toppled ? withConditions(vitals, ['prone'], []) : vitals;
  if (height <= 0 || !(dead || grounded(now))) return [];
  const landed = { ...latest };
  delete landed.altitudeFt;
  if (dead) return [combatantEvent(landed)];
  if (falls) {
    falls.push({ record: landed, vitals: now, feet: height });
    return [combatantEvent(landed)];
  }
  return [combatantEvent(landed), ...fallEvents(state, dice, now, height).events];
}
