import { CREATURE_SIZES, type CreatureSize, type EncounterView, type Square } from '@ltw/contracts';

import { footprint, spanOf } from './board/footprint.ts';

/**
 * A suggested route for the mover to walk, square by square. This is only a
 * convenience for composing the `MoveCombatant` path: it mirrors the terrain
 * the server already published (bounds, walls, living combatants, difficult squares) and the
 * rules of space (docs/adr/0049-space-and-movement.md §1–4: its whole space at every step,
 * through an ally's, a helpless one's, a Tiny one's or one two sizes apart as Difficult Terrain,
 * squeezing a size smaller), but never decides legality. The Rules Engine accepts or refuses the
 * path, including speed, and its answer is what the player is told.
 */
export interface PlannedPath {
  readonly path: readonly Square[];
  /** Advisory feet of movement (5 per square, 10 into difficult terrain, more squeezing). */
  readonly costFt: number;
}

const SQUARE_FT = 5;
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
const HELPLESS = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);
const rank = (size: CreatureSize | undefined) => CREATURE_SIZES.indexOf(size ?? 'medium');

/** The squares of a space `span` across from its north-west square. */
function squaresAt(at: Square, span: number): Square[] {
  const squares: Square[] = [];
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1) squares.push({ x: at.x + dx, y: at.y + dy });
  return squares;
}

export function planPath(
  encounter: EncounterView,
  moverId: string,
  destination: Square,
): PlannedPath | null {
  const mover = encounter.combatants.find((combatant) => combatant.entity.entityId === moverId);
  if (!mover) return null;
  const { width, height, difficult } = encounter.battlefield;
  const walls = new Set((encounter.battlefield.walls ?? []).map(key));
  const hard = new Set(difficult.map(key));
  // Each square another fills, and whether the mover may pass through it.
  const filled = new Map<string, boolean>();
  for (const other of encounter.combatants) {
    if (other.entity.entityId === moverId || other.state === 'dead') continue;
    const passable =
      (other.side === mover.side && other.object === undefined) ||
      other.conditions.some((condition) => HELPLESS.has(condition)) ||
      other.size === 'tiny' ||
      Math.abs(rank(other.size) - rank(mover.size)) >= 2;
    for (const square of footprint(other))
      filled.set(key(square), (filled.get(key(square)) ?? true) && passable);
  }
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
  /** The extra feet its space at `at` costs beyond 5, or null when it cannot stand there. */
  const fit = (at: Square, ending: boolean): number | null => {
    for (const span of spans) {
      const space = squaresAt(at, span);
      if (!space.every(inside)) continue;
      const touched = space.filter((square) => filled.has(key(square)));
      if (ending ? touched.length > 0 : touched.some((square) => filled.get(key(square)) !== true))
        continue;
      const rough = touched.length > 0 || space.some((square) => hard.has(key(square)));
      return (rough ? SQUARE_FT : 0) + (span < whole ? SQUARE_FT : 0);
    }
    return null;
  };
  if (key(destination) === key(mover.position) || fit(destination, true) === null) return null;

  interface Node {
    readonly square: Square;
    readonly costFt: number;
    readonly steps: number;
    readonly from: Node | null;
  }
  const best = new Map<string, Node>();
  const start: Node = { square: mover.position, costFt: 0, steps: 0, from: null };
  best.set(key(start.square), start);
  const open: Node[] = [start];
  while (open.length > 0) {
    open.sort((a, b) => a.costFt - b.costFt || a.steps - b.steps);
    const node = open.shift();
    if (!node) break;
    if (best.get(key(node.square)) !== node) continue;
    if (key(node.square) === key(destination)) {
      const path: Square[] = [];
      let at: Node = node;
      while (at.from) {
        path.unshift(at.square);
        at = at.from;
      }
      return { path, costFt: node.costFt };
    }
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const square = { x: node.square.x + dx, y: node.square.y + dy };
        const extra = fit(square, key(square) === key(destination));
        if (extra === null) continue;
        const next: Node = {
          square,
          costFt: node.costFt + SQUARE_FT + extra,
          steps: node.steps + 1,
          from: node,
        };
        const known = best.get(key(square));
        if (!known || next.costFt < known.costFt) {
          best.set(key(square), next);
          open.push(next);
        }
      }
    }
  }
  return null;
}
