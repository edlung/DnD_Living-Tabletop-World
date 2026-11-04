import type { Battlefield, Square } from '@ltw/contracts';

/**
 * Where a built encounter's combatants start (docs/adr/0057-encounters-maps-loot.md §1): the party
 * along the left edge, one every other row; the foes from the right edge leftward, column by
 * column, each as wide as its size and a square apart. The DM moves any of them on the builder's
 * board before the fight, and on the fight's board once it runs.
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

/** A combatant on the builder's board: a foe of a kind, or a place the party starts on. */
export interface LaidToken {
  readonly key: string;
  readonly side: 'party' | 'hostile';
  readonly name: string;
  readonly size: CreatureSize;
  readonly position: Square;
}

/** The squares a token's space fills (docs/adr/0049-space-and-movement.md §1). */
export function spaceOf(token: Pick<LaidToken, 'position' | 'size'>): Square[] {
  const span = spanOfSize(token.size);
  const squares: Square[] = [];
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1)
      squares.push({ x: token.position.x + dx, y: token.position.y + dy });
  return squares;
}

/** What keeps a laid-out encounter from its fight: a token off the field, in a wall, or two together. */
export type LayoutProblem = 'outside' | 'wall' | 'shared';

export function layoutProblem(
  tokens: readonly LaidToken[],
  field: Pick<Battlefield, 'width' | 'height' | 'walls'>,
): LayoutProblem | null {
  const key = (square: Square) => `${String(square.x)},${String(square.y)}`;
  const walls = new Set((field.walls ?? []).map(key));
  const taken = new Set<string>();
  let problem: LayoutProblem | null = null;
  for (const token of tokens) {
    for (const square of spaceOf(token)) {
      if (square.x < 0 || square.y < 0 || square.x >= field.width || square.y >= field.height)
        return 'outside';
      if (walls.has(key(square))) problem ??= 'wall';
      if (taken.has(key(square))) problem ??= 'shared';
      taken.add(key(square));
    }
  }
  return problem;
}

/** The ground at a new size: what lay beyond it is gone. */
export function resizeGround(ground: Battlefield, width: number, height: number): Battlefield {
  const inside = (square: Square) => square.x < width && square.y < height;
  return {
    ...ground,
    width,
    height,
    difficult: ground.difficult.filter(inside),
    cover: ground.cover.filter(inside),
    ...(ground.walls ? { walls: ground.walls.filter(inside) } : {}),
    ...(ground.water ? { water: ground.water.filter(inside) } : {}),
    ...(ground.ground ? { ground: ground.ground.filter(inside) } : {}),
    ...(ground.obscured ? { obscured: ground.obscured.filter(inside) } : {}),
    ...(ground.light ? { light: ground.light.filter(inside) } : {}),
  };
}
