/**
 * Battlefield geometry (docs/adr/0011-ruleset-srd-5-2.md): 5-ft squares,
 * every step (diagonals included) costs 5 ft, elevation in feet.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
  /** Feet above the ground; a multiple of 5. */
  readonly elevationFt: number;
}

export const SQUARE_FT = 5;

export function distanceFt(a: Position, b: Position): number {
  return (
    SQUARE_FT *
    Math.max(
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
      Math.abs(a.elevationFt - b.elevationFt) / SQUARE_FT,
    )
  );
}

/** Feet a creature must move toward the target to be within `rangeFt` (rounded to squares). */
export function moveRequiredFt(currentDistanceFt: number, rangeFt: number): number {
  const excess = currentDistanceFt - rangeFt;
  return excess <= 0 ? 0 : Math.ceil(excess / SQUARE_FT) * SQUARE_FT;
}

export type PathCost =
  | { readonly valid: true; readonly costFt: number }
  | { readonly valid: false; readonly reason: 'INVALID_PATH' };

/**
 * Cost of moving along `path` (start square first). Each step must move to
 * an adjacent square (one square or 5 ft of elevation in any direction);
 * entering a difficult square costs double.
 */
export function pathCostFt(
  path: readonly Position[],
  isDifficult: (position: Position) => boolean = () => false,
): PathCost {
  let costFt = 0;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    if (!from || !to || !isGridPosition(to) || distanceFt(from, to) !== SQUARE_FT) {
      return { valid: false, reason: 'INVALID_PATH' };
    }
    costFt += isDifficult(to) ? 2 * SQUARE_FT : SQUARE_FT;
  }
  return { valid: true, costFt };
}

export function isGridPosition(position: Position): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    Number.isInteger(position.elevationFt) &&
    position.elevationFt % SQUARE_FT === 0
  );
}
