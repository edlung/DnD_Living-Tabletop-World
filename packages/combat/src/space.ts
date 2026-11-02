import type { Square } from '@ltw/contracts';
import type { CombatantRecord, EncounterState, WorldState } from '@ltw/domain';
import { sizeRank, spanOf, squaresOf, type Placed } from '@ltw/rules';

import { fitsOnField, isDifficult, occupant, placedOf } from './battlefield.ts';
import { isObjectIn } from './objects.ts';
import { incapacitated, sizeOf, vitalsOf } from './vitals.ts';

/**
 * Where a creature's space may go (docs/adr/0049-space-and-movement.md §1–4): on the battlefield
 * and clear of walls; through the space of an ally, an Incapacitated creature, a Tiny one or one
 * two sizes apart, as Difficult Terrain; never ending in another's space, Tiny with Tiny apart; a
 * Large or larger creature squeezing, filling the space of one a size smaller, where it does not
 * fit whole.
 */
export interface StepFit {
  /** It fits only squeezed into a space a size smaller. */
  readonly squeezed: boolean;
  /** It passes through another creature's space: Difficult Terrain to it. */
  readonly through: boolean;
}

/** Whether the mover may pass through the other's space (SRD 5.2.1 "Moving Around Others"). */
function passable(state: WorldState, mover: Placed, moverSide: string, other: CombatantRecord) {
  if (isObjectIn(state, other.entityId)) return false;
  const vitals = vitalsOf(state, other.entityId);
  if (!vitals) return false;
  const size = sizeOf(vitals);
  return (
    other.side === moverSide ||
    incapacitated(vitals) ||
    size === 'tiny' ||
    Math.abs(sizeRank(size) - sizeRank(mover.size)) >= 2
  );
}

/** How the mover's space fits with its north-west square on `square`, or null when it cannot. */
export function fitAt(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  square: Square,
  ending: boolean,
): StepFit | null {
  const placed = placedOf(state, mover);
  const ways = spanOf({ ...placed, squeezed: false }) > 1 ? [false, true] : [false];
  for (const squeezed of ways) {
    const space: Placed = { position: square, size: placed.size, squeezed };
    if (!fitsOnField(encounter, space)) continue;
    let through = false;
    let blocked = false;
    for (const at of squaresOf(space)) {
      const other = occupant(state, encounter, at, mover.entityId);
      if (!other) continue;
      const vitals = vitalsOf(state, other.entityId);
      const tinyTogether = placed.size === 'tiny' && vitals !== null && sizeOf(vitals) === 'tiny';
      if (ending ? !tinyTogether : !passable(state, placed, mover.side, other)) {
        blocked = true;
        break;
      }
      through = true;
    }
    if (!blocked) return { squeezed, through };
  }
  return null;
}

/**
 * Feet one step costs (ADR 0049 §2, §4): 5, another 5 in Difficult Terrain — any square of its
 * space difficult, or another creature's space — and another 5 while squeezing.
 */
export function stepCostFt(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  square: Square,
  fit: StepFit,
): number {
  const space: Placed = { ...placedOf(state, mover), position: square, squeezed: fit.squeezed };
  const hard = fit.through || squaresOf(space).some((at) => isDifficult(encounter, at));
  return 5 + (hard ? 5 : 0) + (fit.squeezed ? 5 : 0);
}
