import type { SpellAreaShape } from '../srd/spell-mechanics.ts';
import type { Square } from './battlefield.ts';

/** A square of the battlefield is 5 feet a side (docs/adr/0011-ruleset-srd-5-2.md). */
export const SQUARE_FT = 5;

/** Feet between two squares on the ground: every step 5 ft, diagonals too (ADR 0011). */
export const squareDistanceFt = (
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number => SQUARE_FT * Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * The board's geometry, shared by the rules and every board (docs/adr/0057-encounters-maps-
 * loot.md §5): the squares a spell's area covers on the grid (docs/adr/0052-spells-as-data.md §5;
 * SRD 5.2.1,
 * "Area of Effect"). A sphere or cylinder: within its radius of its point, as the grid counts.
 * A cube on a point: its squares around that point. From the caster, toward a chosen square: a
 * cone (as wide as it is far), a line (its width), a cube (its face on the caster's side). An
 * emanation: within its reach of the caster's space. The caster's own squares are never in an
 * area it sends out from itself.
 */
export interface SpellArea {
  readonly shape: SpellAreaShape;
  readonly sizeFt: number;
  readonly widthFt: number | null;
  readonly origin: 'point' | 'self';
}

/** A cone is as wide as it is far: half its angle is atan(1/2). */
const CONE_HALF_ANGLE = Math.atan(0.5);
/** Square centres on the edge count in: a whisker of tolerance against rounding. */
const EDGE = 1e-9;

const centreOf = (squares: readonly Square[]) => ({
  x: squares.reduce((sum, square) => sum + square.x + 0.5, 0) / squares.length,
  y: squares.reduce((sum, square) => sum + square.y + 0.5, 0) / squares.length,
});

/**
 * Whether `square` lies in the area: `caster` is the caster's space, `toward` the area's point
 * or, from the caster, the square it points at (none for an emanation).
 */
export function inSpellArea(
  area: SpellArea,
  caster: readonly Square[],
  toward: Square | null,
  square: Square,
): boolean {
  const own = caster.some((one) => one.x === square.x && one.y === square.y);
  const size = area.sizeFt / SQUARE_FT;
  if (area.shape === 'emanation') {
    if (own) return false;
    return caster.some((one) => squareDistanceFt(one, square) <= area.sizeFt);
  }
  if (toward === null) return false;
  if (area.origin === 'point') {
    if (area.shape === 'cube') {
      const start = Math.floor((size - 1) / 2);
      const dx = square.x - (toward.x - start);
      const dy = square.y - (toward.y - start);
      return dx >= 0 && dy >= 0 && dx < size && dy < size;
    }
    return squareDistanceFt(toward, square) <= area.sizeFt;
  }
  if (own) return false;
  const from = centreOf(caster);
  const aim = { x: toward.x + 0.5 - from.x, y: toward.y + 0.5 - from.y };
  const reach = Math.hypot(aim.x, aim.y);
  if (reach === 0) return false;
  const unit = { x: aim.x / reach, y: aim.y / reach };
  const offset = { x: square.x + 0.5 - from.x, y: square.y + 0.5 - from.y };
  const along = offset.x * unit.x + offset.y * unit.y;
  const across = Math.abs(offset.x * unit.y - offset.y * unit.x);
  // From the edge of the caster's space, not its centre.
  const half = Math.sqrt(caster.length) / 2;
  const out = along - half;
  if (area.shape === 'line') {
    const width = (area.widthFt ?? SQUARE_FT) / SQUARE_FT;
    return out > -EDGE && out <= size + EDGE && across <= width / 2 + EDGE;
  }
  if (area.shape === 'cube') {
    return out > -EDGE && out <= size + EDGE && across <= size / 2 + EDGE;
  }
  // A cone: within its length from its point, inside its angle.
  if (out <= -EDGE || out > size + EDGE) return false;
  return Math.atan2(across, Math.max(along, EDGE)) <= CONE_HALF_ANGLE + EDGE;
}

/** Every square of a field an area covers, row by row: what a board draws for a template. */
export function squaresInArea(
  area: SpellArea,
  caster: readonly Square[],
  toward: Square | null,
  field: { readonly width: number; readonly height: number },
): Square[] {
  const squares: Square[] = [];
  for (let y = 0; y < field.height; y += 1)
    for (let x = 0; x < field.width; x += 1)
      if (inSpellArea(area, caster, toward, { x, y })) squares.push({ x, y });
  return squares;
}
