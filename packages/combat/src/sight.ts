import type { LightLevel, Senses, Square } from '@ltw/contracts';
import type { CombatantRecord, EncounterState, WorldState } from '@ltw/domain';
import { obscurementSeen, perceivesWithin, squaresOf, type Obscurement } from '@ltw/rules';

import { gapBetween, isAlive, placedOf } from './battlefield.ts';
import { isObjectIn } from './objects.ts';
import { has, vitalsOf, type Vitals } from './vitals.ts';

/**
 * Who sees whom in a fight (docs/adr/0050-the-world-around.md §1–4): a square's light — as the
 * battlefield marks it, else its ambient light — and its fog or foliage; a viewer's senses within
 * their ranges; Blinded and Invisible. Shared by attacks, spells, reactions and the Hide action,
 * so every rule asks the one question.
 */
const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

export const lightAt = (encounter: EncounterState, square: Square): LightLevel =>
  encounter.battlefield.light?.find((at) => same(at, square))?.level ??
  encounter.battlefield.ambient ??
  'bright';

export function obscuredAt(encounter: EncounterState, square: Square): Obscurement {
  const marked = encounter.battlefield.obscured?.find((at) => same(at, square));
  return marked ? (marked.heavy === true ? 'heavy' : 'light') : 'none';
}

/** Its senses beside sight (§2): none when its sheet or block names none. */
export const sensesOf = (v: Vitals): Senses =>
  v.kind === 'character'
    ? // A Wild Shape's form brings its senses to the Druid's own (docs/adr/0056-…md §5).
      { ...(v.sheet.senses ?? {}), ...(v.form?.senses ?? {}) }
    : (v.block.senses ?? {});

/** Within its Blindsight or Truesight: it perceives the target whatever hides it. */
export function perceives(
  state: WorldState,
  viewer: CombatantRecord,
  target: CombatantRecord,
): boolean {
  const eyes = vitalsOf(state, viewer.entityId);
  return eyes !== null && perceivesWithin(sensesOf(eyes), gapBetween(state, viewer, target));
}

/**
 * Whether `viewer` sees `target`: within its Blindsight or Truesight, always; else not while it
 * is Blinded or the target Invisible, and only if some square of the target's space is not
 * heavily obscured to it. An object sees no one.
 */
export function canSee(
  state: WorldState,
  encounter: EncounterState,
  viewer: CombatantRecord,
  target: CombatantRecord,
): boolean {
  const eyes = vitalsOf(state, viewer.entityId);
  const seen = vitalsOf(state, target.entityId);
  if (!eyes || !seen || isObjectIn(state, viewer.entityId)) return false;
  const senses = sensesOf(eyes);
  const distance = gapBetween(state, viewer, target);
  if (perceivesWithin(senses, distance)) return true;
  if (has(eyes, 'blinded') || has(seen, 'invisible')) return false;
  return squaresOf(placedOf(state, target)).some(
    (square) =>
      obscurementSeen(
        lightAt(encounter, square),
        obscuredAt(encounter, square),
        distance,
        senses,
      ) !== 'heavy',
  );
}

/** Seen only through the dark or the fog: what light and sight hide, conditions apart. */
export function lostInTheDark(
  state: WorldState,
  encounter: EncounterState,
  viewer: CombatantRecord,
  target: CombatantRecord,
): boolean {
  const eyes = vitalsOf(state, viewer.entityId);
  if (!eyes || isObjectIn(state, viewer.entityId)) return false;
  const senses = sensesOf(eyes);
  const distance = gapBetween(state, viewer, target);
  if (perceivesWithin(senses, distance)) return false;
  return squaresOf(placedOf(state, target)).every(
    (square) =>
      obscurementSeen(
        lightAt(encounter, square),
        obscuredAt(encounter, square),
        distance,
        senses,
      ) === 'heavy',
  );
}

/** Heavily obscured to every living foe that is not blind to it otherwise (§4): it may hide. */
export function hiddenByTheDark(
  state: WorldState,
  encounter: EncounterState,
  actor: CombatantRecord,
  foe: (other: CombatantRecord) => boolean,
): boolean {
  const foes = encounter.combatants.filter(
    (other) => foe(other) && isAlive(state, other.entityId) && !isObjectIn(state, other.entityId),
  );
  return foes.length > 0 && foes.every((other) => lostInTheDark(state, encounter, other, actor));
}
