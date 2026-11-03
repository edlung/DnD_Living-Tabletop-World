import { MAX_EXHAUSTION, type KernelCommandOf } from '@ltw/contracts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { abilityModifier } from '@ltw/rules';

import { immersed, isAlive } from './battlefield.ts';
import type { FightWork } from './condition-details.ts';
import { statusDead } from './damage.ts';
import { isObject } from './objects.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import {
  defensesOf,
  exhaustionOf,
  speedsOf,
  vitalsEvent,
  vitalsOf,
  withExhaustion,
  withHitPoints,
  withSheet,
  type Vitals,
} from './vitals.ts';

/**
 * Hazards (SRD 5.2.1; docs/adr/0050-the-world-around.md §8). Breath: a creature fully immersed
 * without a Swim Speed holds it for 1 + its Constitution modifier minutes, at least 30 seconds —
 * rounds of 6 seconds — and out of breath gains 1 Exhaustion level at the end of each of its
 * turns, losing those levels once it breathes again. The road: Extreme Cold asks a DC 10
 * Constitution save each hour, Extreme Heat one of DC 5 the first hour and 1 higher each hour
 * after, with Disadvantage in Medium or Heavy armor; a failure is a level of Exhaustion, and
 * Resistance or Immunity to Cold, or to Fire, passes. Level 6 kills (ADR 0045 §3).
 */
const constitution = (v: Vitals): number =>
  abilityModifier(v.kind === 'character' ? v.sheet.abilities.con : v.block.abilities.con);

/** Rounds of breath held: 10 a minute, at least 5. */
export const breathRounds = (v: Vitals): number => Math.max(5, (1 + constitution(v)) * 10);

/** Exhaustion set to `level`, death at the sixth (ADR 0045 §3). */
export function exhausted(state: WorldState, vitals: Vitals, level: number) {
  const capped = Math.min(MAX_EXHAUSTION, Math.max(0, level));
  let next = withExhaustion(vitals, capped);
  if (capped < MAX_EXHAUSTION) return { vitals: next, dead: false, events: [] as DraftEvent[] };
  next = withSheet(withHitPoints(next, 0), (sheet) => ({ ...sheet, concentration: null }));
  return { vitals: next, dead: true, events: statusDead(state, vitals.entityId) };
}

/** Its breath as its turn ends: held, counted down, lost — or back, in the air. */
export function breathAtTurnEnd(
  work: FightWork,
  state: WorldState,
  encounter: EncounterState,
  combatantId: string,
): DraftEvent[] {
  const record = work.combatant(combatantId);
  const vitals = work.vitalsOf(combatantId);
  if (!record || !vitals || isObject(vitals) || !isAlive(state, combatantId)) return [];
  const under = immersed(state, encounter, record) && speedsOf(vitals).swim === undefined;
  if (!under) {
    if (record.breath === undefined) return [];
    // It breathes again: the levels its lost breath gave go.
    const after = { ...record };
    delete after.breath;
    const level = exhaustionOf(vitals) - record.breath.gained;
    return [
      work.record(after),
      ...(record.breath.gained > 0
        ? [work.vitals(withExhaustion(vitals, Math.max(0, level)))]
        : []),
    ];
  }
  const breath = record.breath ?? { roundsLeft: breathRounds(vitals), gained: 0 };
  if (breath.roundsLeft > 0) {
    return [work.record({ ...record, breath: { ...breath, roundsLeft: breath.roundsLeft - 1 } })];
  }
  // Out of breath: a level of Exhaustion at each turn's end.
  const worse = exhausted(state, vitals, exhaustionOf(vitals) + 1);
  return [
    work.record({ ...record, breath: { ...breath, gained: breath.gained + 1 } }),
    work.vitals(worse.vitals),
    ...worse.events,
  ];
}

/** The party exposed to the cold or the heat of the road for some hours. */
export function decideExposeToHazard(
  context: DecisionContext,
  command: KernelCommandOf<'ExposeToHazard'>,
  dice: Dice,
): Decision {
  const { state } = context;
  if (state.encounter !== null) return reject('INVALID_COMMAND', 'Not while a fight runs');
  const party = [...state.entities.values()].filter(
    (entity) =>
      entity.kind === 'character' &&
      entity.status === 'active' &&
      state.characterSheets.has(entity.entityId),
  );
  if (party.length === 0) return reject('NO_EFFECT', 'No one to expose');
  const passes = command.hazard === 'cold' ? 'cold' : 'fire';
  const events: DraftEvent[] = [];
  for (const entity of party) {
    let vitals = vitalsOf(state, entity.entityId);
    if (!vitals) continue;
    const defenses = defensesOf(vitals);
    if (defenses.resistances?.includes(passes) || defenses.immunities?.includes(passes)) continue;
    events.push(combatPremises(state, entity.entityId));
    const hampered =
      command.hazard === 'heat' &&
      vitals.kind === 'character' &&
      (vitals.sheet.wornArmor?.weight === 'medium' || vitals.sheet.wornArmor?.weight === 'heavy');
    let level = exhaustionOf(vitals);
    for (let hour = 1; hour <= command.hours; hour += 1) {
      const dc = command.hazard === 'cold' ? 10 : 5 + (hour - 1);
      const save = spellSave(dice, vitals, 'con', dc, 'none', 'hazard', false, false, hampered);
      events.push(save.event);
      if (save.success) continue;
      const worse = exhausted(state, vitals, level + 1);
      level += 1;
      vitals = worse.vitals;
      if (worse.dead) {
        events.push(vitalsEvent(vitals), ...worse.events);
        break;
      }
    }
    if (
      level !== exhaustionOf(vitalsOf(state, entity.entityId) ?? vitals) &&
      level < MAX_EXHAUSTION
    ) {
      events.push(vitalsEvent(vitals));
    }
  }
  return events.length === 0
    ? reject('NO_EFFECT', 'The party is proof against it')
    : accept(...events);
}
