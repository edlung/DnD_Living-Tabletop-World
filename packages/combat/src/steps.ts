import type { PathStep } from '@ltw/contracts';
import type { CombatantRecord, EncounterState, WorldState } from '@ltw/domain';
import {
  RUN_UP_FT,
  abilityModifier,
  highJumpFt,
  longJumpFt,
  squaresOf,
  type Placed,
} from '@ltw/rules';

import { groundOf, isDifficult, isWater, placedOf } from './battlefield.ts';
import type { Refusal } from './legality.ts';
import { fitAt } from './space.ts';
import { speedsOf, type Vitals, type Way } from './vitals.ts';

/**
 * A move's steps, each with its way and its feet (docs/adr/0049-space-and-movement.md §5–8): on
 * foot, where ground within 5 ft of the last is walked and more is climbed (an extra foot per foot
 * without a Climb Speed), water swum (likewise without a Swim Speed), the air flown and the earth
 * burrowed only with those speeds; a jump's steps through the air, a long jump no farther than the
 * Strength score after a 10-ft run-up (half standing), landing up to a high jump's height higher; a
 * drop off a ledge or into a pit, its last step, a fall. A Prone creature crawls at an extra foot
 * per foot.
 */
export interface StepCost {
  readonly way: Way;
  readonly feet: number;
}

export interface PathPlan {
  readonly steps: readonly StepCost[];
  /** Squeezed where it ends (§4). */
  readonly squeezed: boolean;
  /** Its height above the ground where it ends (§6). */
  readonly altitudeFt: number;
  /** The feet it falls at its last step: a drop, or a jump landing that far below; else 0 (§8). */
  readonly fallFt: number;
  /** Steps a long jump lands on in Difficult Terrain: a DC 10 Dexterity (Acrobatics) check (§7). */
  readonly landings: readonly number[];
}

const refuse = (reason: Refusal['reason']): Refusal => ({ legal: false, reason });

const strengthOf = (v: Vitals): number =>
  v.kind === 'character' ? v.sheet.abilities.str : v.block.abilities.str;

export function pathPlan(
  state: WorldState,
  encounter: EncounterState,
  mover: CombatantRecord,
  vitals: Vitals,
  path: readonly PathStep[],
  crawling: boolean,
): PathPlan | Refusal {
  const placed = placedOf(state, mover);
  const speeds = speedsOf(vitals);
  const strength = strengthOf(vitals);
  const at = (square: { x: number; y: number }): Placed => ({ ...placed, position: square });
  const hard = (space: Placed) => squaresOf(space).some((square) => isDifficult(encounter, square));
  const wet = (space: Placed) => squaresOf(space).some((square) => isWater(encounter, square));
  const steps: StepCost[] = [];
  const landings: number[] = [];
  let from: { x: number; y: number } = mover.position;
  let altitude = mover.altitudeFt ?? 0;
  let squeezed = mover.squeezed === true;
  let fallFt = 0;
  // On foot just before a jump: its run-up (§7); the jump's takeoff and length so far.
  let onFootFt = 0;
  let takeoff: { ground: number; runUp: boolean; feet: number } | null = null;
  for (const [index, step] of path.entries()) {
    const last = index === path.length - 1;
    const next = step.altitudeFt ?? 0;
    const groundFrom = groundOf(encounter, at(from));
    const groundTo = groundOf(encounter, at(step));
    // Heights count from the battlefield's zero: in the air or underground a step rises or sinks
    // 5 ft at most; on the ground a rise is climbed (§6).
    const rise = groundTo + next - (groundFrom + altitude);
    const across = Math.max(Math.abs(step.x - from.x), Math.abs(step.y - from.y));
    const aloft = next !== 0 || altitude !== 0;
    if (across > 1 || (aloft && Math.abs(rise) > 5) || (across === 0 && rise === 0)) {
      return refuse('INVALID_PATH');
    }
    const fit = fitAt(state, encounter, mover, step, last, next);
    if (!fit) return refuse('INVALID_PATH');
    const squeeze = fit.squeezed ? 5 : 0;
    let way: Way = 'walk';
    let feet: number;
    if (step.jump === true) {
      // Through the air on foot: its run is the steps flagged together, landing on the last.
      if (crawling || altitude !== 0 || next !== 0) return refuse('INVALID_PATH');
      // Its run-up: 10 ft on foot just before, in this move or, jumping at once, this turn (§7).
      const ranUp =
        onFootFt >= RUN_UP_FT || (index === 0 && mover.turn.movementUsedFt >= RUN_UP_FT);
      takeoff ??= { ground: groundFrom, runUp: ranUp, feet: 0 };
      takeoff = { ...takeoff, feet: takeoff.feet + 5 };
      if (takeoff.feet > longJumpFt(strength, takeoff.runUp)) return refuse('JUMP_TOO_FAR');
      const landing = last || path[index + 1]?.jump !== true;
      feet = 5 + squeeze;
      if (landing) {
        const up = groundTo - takeoff.ground;
        if (up > 5 && up > highJumpFt(abilityModifier(strength), takeoff.runUp)) {
          return refuse('JUMP_TOO_FAR');
        }
        // Each foot cleared upward costs a foot; landing far below is a fall, the move's end.
        feet += Math.max(0, up);
        if (up < -5) {
          if (!last) return refuse('INVALID_PATH');
          fallFt = -up;
        }
        if (fit.through || hard(at(step))) landings.push(index);
        takeoff = null;
      }
      onFootFt = 0;
    } else if (step.drop === true) {
      // Off a ledge or into a pit instead of climbing down: a fall, the move's last step (§8).
      const drop = groundFrom + altitude - groundTo;
      if (!last || next !== 0 || drop <= 5) return refuse('INVALID_PATH');
      feet = 5 + squeeze;
      fallFt = drop;
      onFootFt = 0;
    } else if (next > 0 || altitude > 0) {
      way = 'fly';
      if (speeds.fly === undefined || crawling) return refuse('NO_FLY_SPEED');
      feet = 5 + squeeze;
      onFootFt = 0;
    } else if (next < 0 || altitude < 0) {
      way = 'burrow';
      if (speeds.burrow === undefined || wet(at(step))) return refuse('NO_BURROW_SPEED');
      feet = 5 + squeeze;
      onFootFt = 0;
    } else {
      const rough = fit.through || hard(at(step)) ? 5 : 0;
      // A step may climb and swim at once: down a bank into a stream, each foot its own cost.
      const climb = Math.abs(groundTo - groundFrom);
      const climbing = climb > 5;
      const swimming = wet(at(step));
      way = climbing ? 'climb' : swimming ? 'swim' : 'walk';
      feet =
        5 +
        rough +
        squeeze +
        (climbing ? climb * (speeds.climb === undefined ? 2 : 1) : 0) +
        (swimming && speeds.swim === undefined ? 5 : 0) +
        (crawling && !climbing ? 5 : 0);
      onFootFt = way === 'walk' ? onFootFt + 5 : 0;
    }
    steps.push({ way, feet });
    squeezed = fit.squeezed;
    altitude = step.jump === true || step.drop === true ? 0 : next;
    from = step;
  }
  return { steps, squeezed, altitudeFt: altitude, fallFt, landings };
}
