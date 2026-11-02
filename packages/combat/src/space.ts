import type { Square } from '@ltw/contracts';
import type { CombatantRecord, EncounterState, WorldState } from '@ltw/domain';
import { fills, heightFt, sizeRank, spanOf, squaresOf, type Placed } from '@ltw/rules';

import { fitsOnField, groundOf, heightOf, isAlive, placedOf } from './battlefield.ts';
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

/**
 * How the mover's space fits with its north-west square on `square`, `altitudeFt` above the ground
 * there, or null when it cannot. Another creature is in the way only where their heights meet: a
 * flyer passes over, a burrower under (docs/adr/0049-space-and-movement.md §6, §9).
 */
export function fitAt(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  square: Square,
  ending: boolean,
  altitudeFt = 0,
): StepFit | null {
  const placed = placedOf(state, mover);
  const ways = spanOf({ ...placed, squeezed: false }) > 1 ? [false, true] : [false];
  for (const squeezed of ways) {
    const space: Placed = { position: square, size: placed.size, squeezed };
    if (!fitsOnField(encounter, space)) continue;
    const bottom = groundOf(encounter, space) + altitudeFt;
    const top = bottom + heightFt(placed.size);
    const others = encounter.combatants.filter((other) => {
      if (other.entityId === mover.entityId || !isAlive(state, other.entityId)) return false;
      const vitals = vitalsOf(state, other.entityId);
      if (!vitals) return false;
      const below = heightOf(state, encounter, other);
      return below < top && bottom < below + heightFt(sizeOf(vitals));
    });
    let through = false;
    let blocked = false;
    for (const at of squaresOf(space)) {
      const other = others.find((one) => fills(placedOf(state, one), at));
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
