import {
  CREATURE_SIZES,
  type CreatureSize,
  type EncounterView,
  type PathStep,
  type Square,
} from '@ltw/contracts';

import { footprint, spanOf } from './board/footprint.ts';

/**
 * A suggested route for the mover to take, square by square. This is only a convenience for
 * composing the `MoveCombatant` path: it mirrors the terrain the server already published (bounds,
 * walls, living combatants, difficult squares, water, ground heights) and the rules of space and
 * movement (docs/adr/0049-space-and-movement.md §1–6: its whole space at every step, through an
 * ally's, a helpless one's, a Tiny one's or one two sizes apart as Difficult Terrain, squeezing a
 * size smaller; water swum and a rise of more than 5 ft climbed, an extra foot per foot without
 * that speed; crawling while Prone; a flyer at its height, over whoever stands below), but never
 * decides legality. The Rules Engine accepts or refuses the path, including speed, and its answer
 * is what the player is told.
 */
export interface PlannedPath {
  readonly path: readonly PathStep[];
  /** Advisory feet of movement: 5 a square, more into difficult terrain, water, a climb, a squeeze. */
  readonly costFt: number;
}

const SQUARE_FT = 5;
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
const HELPLESS = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);
const rank = (size: CreatureSize | undefined) => CREATURE_SIZES.indexOf(size ?? 'medium');
/** How tall it stands (ADR 0049 §6): its space across in feet, a Tiny one's 5 ft. */
const tallFt = (size: CreatureSize | undefined) =>
  spanOf({ position: { x: 0, y: 0 }, size }) * SQUARE_FT;

/** The squares of a space `span` across from its north-west square. */
function squaresAt(at: Square, span: number): Square[] {
  const squares: Square[] = [];
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1) squares.push({ x: at.x + dx, y: at.y + dy });
  return squares;
}

/** The ground under a space, in feet: its highest square's (ADR 0049 §6); 0 where none is set. */
export function groundUnder(encounter: EncounterView, space: readonly Square[]): number {
  const heights = encounter.battlefield.ground ?? [];
  return Math.max(...space.map((square) => heights.find((at) => key(at) === key(square))?.ft ?? 0));
}

export function planPath(
  encounter: EncounterView,
  moverId: string,
  destination: Square,
  crawl = false,
): PlannedPath | null {
  const mover = encounter.combatants.find((combatant) => combatant.entity.entityId === moverId);
  if (!mover) return null;
  const { width, height, difficult } = encounter.battlefield;
  const walls = new Set((encounter.battlefield.walls ?? []).map(key));
  const hard = new Set(difficult.map(key));
  const wet = new Set((encounter.battlefield.water ?? []).map(key));
  const speeds = mover.speeds ?? {};
  // In the air (or underground) it keeps its height above the battlefield's zero (§6, §9).
  const altitude = mover.altitudeFt ?? 0;
  const level = groundUnder(encounter, footprint(mover)) + altitude;
  const tall = tallFt(mover.size);
  // Every other living one: its squares, how high it reaches, and whether the mover may pass.
  // A rider is in its mount's space, never a space of its own (ADR 0049 §10).
  const others = encounter.combatants
    .filter(
      (other) =>
        other.entity.entityId !== moverId &&
        other.state !== 'dead' &&
        other.mountedOn === undefined,
    )
    .map((other) => {
      const space = footprint(other);
      const bottom = groundUnder(encounter, space) + (other.altitudeFt ?? 0);
      const passable =
        (other.side === mover.side && other.object === undefined) ||
        other.conditions.some((condition) => HELPLESS.has(condition)) ||
        other.size === 'tiny' ||
        Math.abs(rank(other.size) - rank(mover.size)) >= 2;
      return {
        squares: new Set(space.map(key)),
        bottom,
        top: bottom + tallFt(other.size),
        passable,
      };
    });
  // Known traps it keeps clear of on the way, and harmful ground it skirts where that costs no more
  // (docs/adr/0057-encounters-maps-loot.md §6): advice only — the World Engine decides.
  const trapped = new Set(
    (encounter.battlefield.traps ?? [])
      .filter((trap) => trap.disarmed !== true)
      .flatMap((trap) => trap.squares.map(key)),
  );
  const harmful = new Set((encounter.battlefield.hazards ?? []).map(key));
  const inside = (square: Square) =>
    square.x >= 0 &&
    square.y >= 0 &&
    square.x < width &&
    square.y < height &&
    !walls.has(key(square));
  // Whole, or a size smaller where a Large or larger one squeezes (ADR 0049 §4).
  const whole = spanOf({ position: mover.position, size: mover.size });
  const spans =
    whole > 1
      ? [whole, spanOf({ position: mover.position, size: mover.size, squeezed: true })]
      : [whole];

  interface Fit {
    /** Feet beyond the square's 5. */
    readonly extra: number;
    readonly ground: number;
    /** Its height above that ground there: in the air, or underground. */
    readonly altitudeFt: number;
    /** Squares of harmful ground it would stand on there. */
    readonly risk: number;
  }
  /** What its space at `at` costs, stepping from ground `from`; null where it cannot be. */
  const fit = (at: Square, from: number, ending: boolean): Fit | null => {
    for (const span of spans) {
      const space = squaresAt(at, span);
      if (!space.every(inside)) continue;
      const ground = groundUnder(encounter, space);
      const above = altitude === 0 ? 0 : level - ground;
      // A flyer goes no lower than the ground, a burrower no higher.
      if ((altitude > 0 && above < 0) || (altitude < 0 && above > 0)) continue;
      const bottom = ground + above;
      const met = others.filter(
        (other) =>
          other.bottom < bottom + tall &&
          bottom < other.top &&
          space.some((square) => other.squares.has(key(square))),
      );
      if (ending ? met.length > 0 : met.some((other) => !other.passable)) continue;
      const squeeze = span < whole ? SQUARE_FT : 0;
      if (altitude !== 0) return { extra: squeeze, ground, altitudeFt: above, risk: 0 };
      if (!ending && space.some((square) => trapped.has(key(square)))) continue;
      const risk = space.filter((square) => harmful.has(key(square))).length;
      const rough = met.length > 0 || space.some((square) => hard.has(key(square))) ? SQUARE_FT : 0;
      // A step may climb and swim at once, each foot its own cost.
      const climb = Math.abs(ground - from);
      const climbing = climb > SQUARE_FT;
      const swimming = space.some((square) => wet.has(key(square)));
      const extra =
        rough +
        squeeze +
        (climbing ? climb * (speeds.climb === undefined ? 2 : 1) : 0) +
        (swimming && speeds.swim === undefined ? SQUARE_FT : 0) +
        (crawl && !climbing ? SQUARE_FT : 0);
      return { extra, ground, altitudeFt: 0, risk };
    }
    return null;
  };
  if (key(destination) === key(mover.position) || fit(destination, 0, true) === null) return null;

  interface Node {
    readonly square: Square;
    readonly ground: number;
    readonly altitudeFt: number;
    readonly costFt: number;
    readonly risk: number;
    readonly steps: number;
    readonly from: Node | null;
  }
  const best = new Map<string, Node>();
  const start: Node = {
    square: mover.position,
    ground: groundUnder(encounter, footprint(mover)),
    altitudeFt: altitude,
    costFt: 0,
    risk: 0,
    steps: 0,
    from: null,
  };
  best.set(key(start.square), start);
  const open: Node[] = [start];
  while (open.length > 0) {
    open.sort((a, b) => a.costFt - b.costFt || a.risk - b.risk || a.steps - b.steps);
    const node = open.shift();
    if (!node) break;
    if (best.get(key(node.square)) !== node) continue;
    if (key(node.square) === key(destination)) {
      const path: PathStep[] = [];
      let at: Node = node;
      while (at.from) {
        path.unshift(at.altitudeFt === 0 ? at.square : { ...at.square, altitudeFt: at.altitudeFt });
        at = at.from;
      }
      return { path, costFt: node.costFt };
    }
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const square = { x: node.square.x + dx, y: node.square.y + dy };
        const step = fit(square, node.ground, key(square) === key(destination));
        if (step === null) continue;
        const next: Node = {
          square,
          ground: step.ground,
          altitudeFt: step.altitudeFt,
          costFt: node.costFt + SQUARE_FT + step.extra,
          risk: node.risk + step.risk,
          steps: node.steps + 1,
          from: node,
        };
        const known = best.get(key(square));
        if (
          !known ||
          next.costFt < known.costFt ||
          (next.costFt === known.costFt && next.risk < known.risk)
        ) {
          best.set(key(square), next);
          open.push(next);
        }
      }
    }
  }
  return null;
}
