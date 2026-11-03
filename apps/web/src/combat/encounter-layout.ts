import type { Square } from '@ltw/contracts';

/**
 * Where a built encounter's combatants start (docs/adr/0057-encounters-maps-loot.md §1): the party
 * along the left edge, one every other row; the foes from the right edge leftward, column by
 * column, each as wide as its size and a square apart. The DM moves any of them on the board once
 * the fight runs.
 */
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

const SPAN: Readonly<Record<CreatureSize, number>> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export const spanOfSize = (size: CreatureSize): number => SPAN[size];

/** The party's starting squares: the left edge, every other row from the second. */
export function partyStartSquares(
  count: number,
  field: { width: number; height: number },
): Square[] {
  const squares: Square[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = 1 + 2 * index;
    const column = Math.floor(row / field.height) * 2;
    squares.push({ x: Math.min(field.width - 1, column), y: row % field.height });
  }
  return squares;
}

/** The foes' squares, or null when they do not all fit on the field. */
export function foeSquares(
  sizes: readonly CreatureSize[],
  field: { width: number; height: number },
): Square[] | null {
  const squares: Square[] = [];
  let right = field.width;
  let column: { x: number; widest: number } | null = null;
  let y = 0;
  for (const size of sizes) {
    const span = spanOfSize(size);
    if (column === null || y + span > field.height) {
      // A new column, a square to the left of the last one's widest creature.
      right = column === null ? field.width : column.x - 1;
      column = { x: right - span, widest: span };
      y = 0;
    }
    const x = Math.min(column.x, right - span);
    if (x < field.width / 2 || y + span > field.height) return null;
    squares.push({ x, y });
    column = { x: Math.min(column.x, x), widest: Math.max(column.widest, span) };
    y += span + 1;
  }
  return squares;
}
