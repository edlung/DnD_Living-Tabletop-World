import type { CharacterSheet } from '@ltw/contracts';
import { combatantOf, type Dice, type DraftEvent, type WorldState } from '@ltw/domain';
import {
  concentrationSaveDc,
  d20Test,
  damageAfterDefenses,
  damageAtZero,
  exhaustionPenalty,
} from '@ltw/rules';

import { immersed } from './battlefield.ts';
import { isObject, isObjectIn } from './objects.ts';
import {
  ceilingOf,
  defensesOf,
  exhaustionOf,
  has,
  hitPoints,
  knockedOutOf,
  saveModifier,
  vitalsEvent,
  withAllHitPoints,
  withConditions,
  withHitPoints,
  withKnockedOut,
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
  /** A melee attack's choice: at 0 it is left at 1 and Unconscious (docs/adr/0048-hit-points.md §4). */
  readonly knockOut?: boolean;
  /** A fall's damage, from this many feet (docs/adr/0049-space-and-movement.md §8). */
  readonly fallFt?: number;
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

/**
 * The creature's death, or an object's destruction (docs/adr/0048-hit-points.md §5), unless it
 * came already.
 */
export const statusDead = (state: WorldState, entityId: string): DraftEvent[] => {
  const from = state.entities.get(entityId)?.status ?? 'active';
  const to = isObjectIn(state, entityId) ? 'destroyed' : 'dead';
  return from !== 'active'
    ? []
    : [{ type: 'EntityStatusChanged', payload: { entityId, from, to } }];
};

/** The Concentration a creature keeps after damage, with the save's record (characters only). */
function concentrationAfterDamage(dice: Dice, v: Vitals, damage: number): Applied {
  if (v.kind !== 'character' || v.sheet.concentration === null || damage <= 0)
    return { vitals: v, events: [] };
  const dc = concentrationSaveDc(damage);
  // Exhaustion takes 2 per level from the save (docs/adr/0045-conditions-and-actions.md §3).
  const modifier = saveModifier(v, 'con') + exhaustionPenalty(exhaustionOf(v));
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
  const hp = hitPoints(target);
  const before = hp.current;
  const max = ceilingOf(target);
  // Its defenses first, Petrified's Resistance among them (docs/adr/0048-hit-points.md §3; ADR
  // 0045 §1); then its temporary hit points take what they can (ADR 0048 §1).
  // Fully under water, fire is resisted (docs/adr/0049-space-and-movement.md §11).
  const standing = state.encounter ? combatantOf(state.encounter, target.entityId) : undefined;
  const wet =
    state.encounter !== null &&
    standing !== undefined &&
    immersed(state, state.encounter, standing);
  const defenses = defensesOf(target);
  const defended = damageAfterDefenses(
    Math.max(0, input.amount),
    input.damageType,
    wet ? { ...defenses, resistances: [...(defenses.resistances ?? []), 'fire'] } : defenses,
    has(target, 'petrified'),
  );
  const amount = defended.amount;
  const absorbed = Math.min(hp.temporary ?? 0, amount);
  const taken = amount - absorbed;
  // A creature is knocked out; an object is broken all the same (ADR 0048 §4–5).
  const knockedOut = input.knockOut === true && !isObject(target) && before > 0 && taken >= before;
  const hpAfter = knockedOut ? 1 : Math.max(0, before - taken);
  // Brought to 0, a knocked-out creature is dying or dead instead (ADR 0048 §4).
  const spent = withKnockedOut(
    withAllHitPoints(target, { ...hp, temporary: (hp.temporary ?? 0) - absorbed }),
    knockedOutOf(target) && hpAfter > 0,
  );
  const record: DraftEvent = {
    type: 'DamageApplied',
    payload: {
      targetId: target.entityId,
      sourceId: input.sourceId,
      amount,
      damageType: input.damageType,
      rolls: [...input.rolls],
      hpBefore: before,
      hpAfter,
      ...(defended.defense === null ? {} : { defense: defended.defense, dealt: input.amount }),
      ...(absorbed > 0 ? { absorbed } : {}),
      ...(knockedOut ? { knockedOut: true as const } : {}),
      ...(input.fallFt === undefined ? {} : { fallFt: input.fallFt }),
    },
  };

  // Knocked out instead of brought to 0: 1 hit point, Unconscious and Prone (ADR 0048 §4).
  if (knockedOut) {
    let vitals = withConditions(withHitPoints(spent, 1), ['unconscious', 'prone'], []);
    vitals = withKnockedOut(vitals, true);
    vitals = withSheet(vitals, (sheet) => ({ ...calm(sheet), concentration: null }));
    return {
      vitals,
      events: [
        record,
        condition(target.entityId, 'unconscious', true, 'knocked-out'),
        ...(has(target, 'prone') ? [] : [condition(target.entityId, 'prone', true, 'knocked-out')]),
        vitalsEvent(vitals),
      ],
    };
  }

  // A dying character: damage adds death save failures, or kills outright.
  if (target.kind === 'character' && before === 0) {
    if (taken === 0) return { vitals: spent, events: [record, vitalsEvent(spent)] };
    const saves = target.sheet.deathSaves ?? { successes: 0, failures: 0 };
    const result = damageAtZero(saves, taken, max, input.critical);
    const vitals = withSheet(spent, (sheet) => ({ ...sheet, deathSaves: result.saves }));
    return {
      vitals,
      events: [
        record,
        vitalsEvent(vitals),
        ...(result.dead ? statusDead(state, target.entityId) : []),
      ],
    };
  }

  const after = hpAfter;
  let vitals = withHitPoints(spent, after);
  if (after > 0) {
    const kept = concentrationAfterDamage(dice, vitals, amount);
    return { vitals: kept.vitals, events: [record, ...kept.events, vitalsEvent(kept.vitals)] };
  }
  if (target.kind === 'creature' || taken - before >= max) {
    // Monsters die at 0 HP; a character dies from massive damage (ADR 0015 §4).
    vitals = withSheet(vitals, (sheet) => ({ ...sheet, concentration: null }));
    return { vitals, events: [record, vitalsEvent(vitals), ...statusDead(state, target.entityId)] };
  }
  vitals = withConditions(vitals, ['unconscious', 'prone'], []);
  vitals = withSheet(vitals, (sheet) => ({
    ...calm(sheet),
    concentration: null,
    deathSaves: { successes: 0, failures: 0 },
  }));
  const fell = [
    condition(target.entityId, 'unconscious', true, 'zero-hit-points'),
    ...(has(target, 'prone') ? [] : [condition(target.entityId, 'prone', true, 'zero-hit-points')]),
  ];
  return { vitals, events: [record, ...fell, vitalsEvent(vitals)] };
}

/** Unconscious, a creature's Rage ends (docs/adr/0056-characters-from-the-srd.md §4). */
function calm(sheet: CharacterSheet): CharacterSheet {
  if (!sheet.raging) return sheet;
  const next = { ...sheet };
  delete next.raging;
  return next;
}

/** Healing up to the maximum; a character at 0 HP regains consciousness but stays Prone. */
export function applyHealing(
  target: Vitals,
  input: { readonly sourceId: string; readonly amount: number; readonly rolls: readonly number[] },
): Applied {
  const { current } = hitPoints(target);
  // Up to the maximum as an effect may have lowered it (ADR 0048 §2).
  const after = Math.min(ceilingOf(target), current + Math.max(0, input.amount));
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
  // The dying or the knocked out (ADR 0048 §4) wake when they regain hit points; a creature the
  // DM made Unconscious stays so.
  if (after > current && has(target, 'unconscious') && (current === 0 || knockedOutOf(target))) {
    vitals = withConditions(vitals, [], ['unconscious']);
    vitals = withoutDeathSaves(vitals);
    events.push(condition(target.entityId, 'unconscious', false, 'healed'));
  }
  events.push(vitalsEvent(vitals));
  return { vitals, events };
}
