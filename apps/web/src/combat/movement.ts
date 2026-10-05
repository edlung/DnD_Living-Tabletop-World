import type { EncounterView, Square } from '@ltw/contracts';

/**
 * A suggested route for the mover to walk, square by square. This is only a
 * convenience for composing the `MoveCombatant` path: it mirrors the terrain
 * the server already published (bounds, living combatants, difficult squares)
 * but never decides legality. The Rules Engine accepts or refuses the path,
 * including speed, and its answer is what the player is told.
 */
export interface PlannedPath {
  readonly path: readonly Square[];
  /** Advisory feet of movement (5 per square, 10 into difficult terrain). */
  readonly costFt: number;
}

const SQUARE_FT = 5;
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;

export function planPath(
  encounter: EncounterView,
  moverId: string,
  destination: Square,
): PlannedPath | null {
  const mover = encounter.combatants.find((combatant) => combatant.entity.entityId === moverId);
  if (!mover) return null;
  const { width, height, difficult } = encounter.battlefield;
  const blocked = new Set(
    encounter.combatants
      .filter((combatant) => combatant.entity.entityId !== moverId && combatant.state !== 'dead')
      .map((combatant) => key(combatant.position)),
  );
  const hard = new Set(difficult.map(key));
  const inside = (square: Square) =>
    square.x >= 0 && square.y >= 0 && square.x < width && square.y < height;
  if (!inside(destination) || blocked.has(key(destination))) return null;
  if (key(destination) === key(mover.position)) return null;

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
        if (!inside(square) || blocked.has(key(square))) continue;
        const next: Node = {
          square,
          costFt: node.costFt + (hard.has(key(square)) ? 2 * SQUARE_FT : SQUARE_FT),
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
