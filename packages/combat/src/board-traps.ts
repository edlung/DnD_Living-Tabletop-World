import type { BoardHazard, BoardTrap, PathStep, Square } from '@ltw/contracts';
import type { CombatantRecord, Dice, DraftEvent, EncounterState, WorldState } from '@ltw/domain';
import { fills, rollDamage, trapRules } from '@ltw/rules';

import { isAlive, placedOf } from './battlefield.ts';
import { isObject } from './objects.ts';
import { combatPremises } from './refusal.ts';
import { spellSave } from './saves.ts';
import { harm, sprung, type Caught } from './toolbox.ts';
import { vitalsOf, type Vitals } from './vitals.ts';

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

/** The first step of a path that brings the mover onto an armed trap: it stops there. */
export function trapStep(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  path: readonly PathStep[],
): { readonly index: number; readonly trap: BoardTrap } | null {
  const traps = (encounter.battlefield.traps ?? []).filter((trap) => trapArmed(trap, encounter));
  if (traps.length === 0) return null;
  for (const [index, step] of path.entries()) {
    if (!onGround(step)) continue;
    const covers = spaceAt(state, mover, step);
    const trap = traps.find((one) => one.squares.some(covers));
    if (trap) return { index, trap };
  }
  return null;
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
