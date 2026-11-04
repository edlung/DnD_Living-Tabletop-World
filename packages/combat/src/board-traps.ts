import type { BoardHazard, BoardTrap, PathStep, Square } from '@ltw/contracts';
import type { CombatantRecord, Dice, DraftEvent, EncounterState, WorldState } from '@ltw/domain';
import {
  abilityModifier,
  checkEffects,
  fills,
  gapFt,
  rollDamage,
  skillModifier,
  trapRules,
} from '@ltw/rules';

import { isAlive, placedOf } from './battlefield.ts';
import { isObject } from './objects.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import { harm, sprung, type Caught } from './toolbox.ts';
import { conditionsOf, exhaustionOf, ordealOf, vitalsOf, type Vitals } from './vitals.ts';

/**
 * Traps and harmful ground on the board (docs/adr/0057-encounters-maps-loot.md §6) as a move or a
 * turn's start meets them. A creature whose space comes onto an armed trap at ground level stops
 * there and springs it — on itself, or on every creature on the trap, as the trap catches; the
 * trap is found, counts the spring and leaves its rubble or its open pit. Harmful ground harms a
 * creature whose space comes onto it, a square once a move, and one that starts its turn on it,
 * each kind once. A step through the air — a flight above the ground, a jump — touches neither.
 */
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
const onGround = (step: PathStep) => step.jump !== true && (step.altitudeFt ?? 0) === 0;

/** Whether a trap springs now: not disarmed, and not spent or waiting for the next turn. */
export function trapArmed(trap: BoardTrap, encounter: EncounterState): boolean {
  if (trap.disarmed === true) return false;
  const springs = trap.springs ?? 0;
  if (springs === 0) return true;
  const { resets } = trapRules(trap.trapId);
  if (resets === 'never' || (resets === 'thrice' && springs >= 3)) return false;
  const last = trap.lastSprung;
  return (
    last === undefined || last.round !== encounter.round || last.turn !== encounter.currentIndex
  );
}

/** Whether a square lies under the creature's space standing on `at`. */
function spaceAt(
  state: WorldState,
  record: CombatantRecord,
  at: Square,
): (square: Square) => boolean {
  const here = { ...placedOf(state, record), position: { x: at.x, y: at.y } };
  return (square) => fills(here, square);
}

/**
 * The trap springs, set off by `by` where its record stands (`byVitals`: what it is now, null when
 * it fell on the way): it catches that creature, or every living creature on the trap at ground
 * level; each saves and takes its harm.
 */
export function springTrap(
  state: WorldState,
  encounter: EncounterState,
  dice: Dice,
  trap: BoardTrap,
  by: CombatantRecord,
  byVitals: Vitals | null,
): DraftEvent[] {
  const rules = trapRules(trap.trapId);
  const tier = rules.tiers[trap.tier - 1];
  const first = trap.squares[0];
  if (!tier || !first) return [];
  const events: DraftEvent[] = [
    {
      type: 'TrapChanged',
      payload: {
        encounterId: encounter.encounterId,
        square: { x: first.x, y: first.y },
        change: 'sprung',
        byId: by.entityId,
        trap: {
          ...trap,
          found: true,
          springs: (trap.springs ?? 0) + 1,
          lastSprung: { round: encounter.round, turn: encounter.currentIndex },
        },
        ...(rules.leaves === 'rubble' ? { rubble: true as const } : {}),
        ...(rules.leaves === 'pit' && tier.fallFt !== undefined ? { pitFt: tier.fallFt } : {}),
      },
    },
  ];
  const onTrap = (record: CombatantRecord) =>
    (record.altitudeFt ?? 0) === 0 && trap.squares.some(spaceAt(state, record, record.position));
  const caught: Vitals[] = byVitals ? [byVitals] : [];
  if (rules.catches === 'area') {
    for (const other of encounter.combatants) {
      if (other.entityId === by.entityId || !isAlive(state, other.entityId) || !onTrap(other))
        continue;
      const vitals = vitalsOf(state, other.entityId);
      if (vitals) caught.push(vitals);
    }
  }
  for (const vitals of caught) {
    if (!isObject(vitals)) events.push(...sprung(state, dice, rules, trap.tier, vitals).events);
  }
  return events;
}

/** What harmful ground does to a creature: its save, then the damage — none or half on a success. */
export function groundHarm(
  state: WorldState,
  dice: Dice,
  caught: Caught,
  hazard: BoardHazard,
): Caught {
  if (caught.dead || isObject(caught.vitals)) return caught;
  const save = spellSave(dice, caught.vitals, hazard.ability, hazard.dc, 'none', 'hazard');
  const roll = rollDamage(dice, hazard.dice.count, hazard.dice.sides, 0);
  const amount = !save.success
    ? roll.total
    : hazard.onSuccess === 'half'
      ? Math.floor(roll.total / 2)
      : 0;
  return harm(
    state,
    dice,
    { ...caught, events: [...caught.events, save.event] },
    amount,
    hazard.kind,
    roll.rolls,
  );
}

/** The harmful ground a walk brings the mover onto, a square once, in the order it comes. */
export function groundWalked(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  walked: readonly PathStep[],
): BoardHazard[] {
  const hazards = encounter.battlefield.hazards ?? [];
  if (hazards.length === 0) return [];
  // The ground it stands on already does not harm it again as it moves on.
  const met = new Set(hazards.filter(spaceAt(state, mover, mover.position)).map(key));
  const found: BoardHazard[] = [];
  for (const step of walked) {
    if (!onGround(step)) continue;
    const covers = spaceAt(state, mover, step);
    for (const square of hazards) {
      if (!covers(square) || met.has(key(square))) continue;
      met.add(key(square));
      found.push(square.hazard);
    }
  }
  return found;
}

/**
 * As a creature's turn starts on the ground: the harmful ground under it, each kind once, and a
 * trap that springs too on one standing on it (the statue's plate).
 */
export function turnStartGround(
  state: WorldState,
  encounter: EncounterState,
  dice: Dice,
  record: CombatantRecord,
  vitals: Vitals | null,
): DraftEvent[] {
  if (!vitals || (record.altitudeFt ?? 0) !== 0) return [];
  const covers = spaceAt(state, record, record.position);
  const kinds = new Map<string, BoardHazard>();
  for (const square of encounter.battlefield.hazards ?? []) {
    if (covers(square)) kinds.set(JSON.stringify(square.hazard), square.hazard);
  }
  let caught: Caught = { vitals, events: [], dead: false };
  for (const hazard of kinds.values()) caught = groundHarm(state, dice, caught, hazard);
  const trap = (encounter.battlefield.traps ?? []).find(
    (one) =>
      trapRules(one.trapId).onTurnStart && trapArmed(one, encounter) && one.squares.some(covers),
  );
  const sprungHere =
    trap && !caught.dead ? springTrap(state, encounter, dice, trap, record, caught.vitals) : [];
  if (caught.events.length === 0 && sprungHere.length === 0) return [];
  return [combatPremises(state, record.entityId), ...caught.events, ...sprungHere];
}

/**
 * A creature's Passive Wisdom (Perception) (SRD 5.2.1 glossary): 10 plus its check's bonus, 5 more
 * with Advantage, 5 less with Disadvantage.
 */
export function passivePerception(vitals: Vitals): number {
  const effects = checkEffects(conditionsOf(vitals), exhaustionOf(vitals), ordealOf(vitals));
  const bonus =
    vitals.kind === 'character'
      ? skillModifier(vitals.sheet, 'perception')
      : abilityModifier(vitals.block.abilities.wis);
  const tilt = effects.advantage === effects.disadvantage ? 0 : effects.advantage ? 5 : -5;
  return 10 + bonus + effects.penalty + tilt;
}

/** Whether a trap lies within 5 feet of the creature's space standing on `at`. */
function near(state: WorldState, record: CombatantRecord, at: Square, trap: BoardTrap): boolean {
  const here = { ...placedOf(state, record), position: { x: at.x, y: at.y } };
  return trap.squares.some((square) => gapFt(here, { position: square, size: 'medium' }) <= 5);
}

/** A hidden trap the party has not found yet, still to spring. */
const unfound = (trap: BoardTrap, encounter: EncounterState) =>
  trap.hidden && trap.found !== true && trapArmed(trap, encounter);

/** The trap the party now knows of. */
const foundEvent = (
  encounter: EncounterState,
  trap: BoardTrap,
  byId: string,
  change: 'found' | 'disarmed',
): DraftEvent => {
  const first = trap.squares[0] ?? { x: 0, y: 0 };
  return {
    type: 'TrapChanged',
    payload: {
      encounterId: encounter.encounterId,
      square: { x: first.x, y: first.y },
      change,
      byId,
      trap: { ...trap, found: true, ...(change === 'disarmed' ? { disarmed: true as const } : {}) },
    },
  };
};

export interface WalkDangers {
  /** Where the move ends early: on a trap it springs, or short of a trap it noticed ahead. */
  readonly stop: { readonly index: number; readonly sprung: BoardTrap | null } | null;
  /** The hidden traps it noticed on the way, each with the step it noticed it at (-1: setting off). */
  readonly noticed: readonly { readonly trap: BoardTrap; readonly index: number }[];
}

/**
 * What a walk meets of the traps (ADR 0057 §6): step by step, an armed trap its space comes onto
 * at ground level, where it stops and springs it; and, for a creature of the party, a hidden trap
 * found by a Search that its Passive Perception meets as it comes within 5 feet — noticed, and the
 * walk stops short of it when the rest would come onto it.
 */
export function walkDangers(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly PathStep[],
): WalkDangers {
  const armed = (encounter.battlefield.traps ?? []).filter((trap) => trapArmed(trap, encounter));
  const noticed: { trap: BoardTrap; index: number }[] = [];
  if (armed.length === 0) return { stop: null, noticed };
  const vitals = mover.side === 'party' ? vitalsOf(state, mover.entityId) : null;
  const passive = vitals ? passivePerception(vitals) : null;
  const notice = (at: Square, index: number): BoardTrap[] => {
    if (passive === null) return [];
    const seen = armed.filter((trap) => {
      const { detect } = trapRules(trap.trapId);
      return (
        unfound(trap, encounter) &&
        !noticed.some((known) => known.trap === trap) &&
        detect.action === 'search' &&
        detect.dc <= passive &&
        near(state, mover, at, trap)
      );
    });
    for (const trap of seen) noticed.push({ trap, index });
    return seen;
  };
  const comesOnto = (from: number, traps: readonly BoardTrap[]) =>
    path
      .slice(from)
      .some(
        (step) =>
          onGround(step) && traps.some((trap) => trap.squares.some(spaceAt(state, mover, step))),
      );
  const before = notice(mover.position, -1);
  if (before.length > 0 && comesOnto(0, before))
    return { stop: { index: -1, sprung: null }, noticed };
  for (const [index, step] of path.entries()) {
    if (onGround(step)) {
      const covers = spaceAt(state, mover, step);
      const trap = armed.find((one) => one.squares.some(covers));
      if (trap) return { stop: { index, sprung: trap }, noticed };
    }
    const seen = notice(step, index);
    if (seen.length > 0 && comesOnto(index + 1, seen))
      return { stop: { index, sprung: null }, noticed };
  }
  return { stop: null, noticed };
}

/** The traps a walk noticed, up to where it stopped: the party knows of them now. */
export function noticedEvents(
  encounter: EncounterState,
  dangers: WalkDangers,
  walked: number,
  byId: string,
): DraftEvent[] {
  return dangers.noticed
    .filter((one) => one.index < walked)
    .map((one) => foundEvent(encounter, one.trap, byId, 'found'));
}

/**
 * A Search or a Study (SRD 5.2.1 traps): the hidden traps within 5 feet that this action finds —
 * a Search's Wisdom (Perception), a Study's Intelligence (Investigation) — at or above their DC.
 */
export function trapsFound(
  state: WorldState,
  encounter: EncounterState,
  actor: CombatantRecord,
  action: 'search' | 'study',
  skill: string,
  total: number,
): DraftEvent[] {
  const wanted = action === 'search' ? 'perception' : 'investigation';
  if (skill !== wanted) return [];
  return (encounter.battlefield.traps ?? [])
    .filter((trap) => {
      const { detect } = trapRules(trap.trapId);
      return (
        unfound(trap, encounter) &&
        detect.action === action &&
        detect.dc <= total &&
        near(state, actor, actor.position, trap)
      );
    })
    .map((trap) => foundEvent(encounter, trap, actor.entityId, 'found'));
}

/**
 * The trap a creature may disarm on a square with Utilize (SRD 5.2.1 traps: the wire cut, the
 * holes plugged, the glyph defaced, a spike under the plate or the lid — no check): one the party
 * knows of, still to spring, within 5 feet. The refusal never tells a hidden trap from none.
 */
export function disarmable(
  state: WorldState,
  encounter: EncounterState,
  actor: CombatantRecord,
  square: Square,
): BoardTrap | 'NO_KNOWN_TRAP' | 'OUT_OF_RANGE' {
  const trap = (encounter.battlefield.traps ?? []).find((one) =>
    one.squares.some(({ x, y }) => x === square.x && y === square.y),
  );
  if (!trap || (trap.hidden && trap.found !== true) || !trapArmed(trap, encounter))
    return 'NO_KNOWN_TRAP';
  return near(state, actor, actor.position, trap) ? trap : 'OUT_OF_RANGE';
}

export const disarmedEvent = (encounter: EncounterState, trap: BoardTrap, byId: string) =>
  foundEvent(encounter, trap, byId, 'disarmed');
