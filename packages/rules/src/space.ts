import { CREATURE_SIZES, type CreatureSize } from '@ltw/contracts';

import { SQUARE_FT } from './grid.ts';

/**
 * Size and space on the 5-ft grid (SRD 5.2.1; docs/adr/0049-space-and-movement.md §1, §4): a
 * creature fills a square of squares from its north-west one — 1 for Tiny to Medium, 2 for Large,
 * 3 for Huge, 4 for Gargantuan — and one size smaller while it squeezes. Distances run from the
 * nearest square of one to the nearest of the other.
 */
export interface Square {
  readonly x: number;
  readonly y: number;
}

export interface Placed {
  readonly position: Square;
  readonly size: CreatureSize;
  readonly squeezed?: boolean | undefined;
}

const SPAN: Readonly<Record<CreatureSize, number>> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

/** The size's place in the order Tiny … Gargantuan: two creatures' sizes apart is a difference. */
export const sizeRank = (size: CreatureSize): number => CREATURE_SIZES.indexOf(size);

/** One size smaller, Tiny staying Tiny. */
export const smallerSize = (size: CreatureSize): CreatureSize =>
  CREATURE_SIZES[Math.max(0, sizeRank(size) - 1)] ?? size;

/** Squares across the creature's space, as it stands now. */
export const spanOf = (placed: Placed): number =>
  SPAN[placed.squeezed === true ? smallerSize(placed.size) : placed.size];

/** Squares across the space of a creature of this size. */
export const spanOfSize = (size: CreatureSize): number => SPAN[size];

/** Every square the creature fills. */
export function squaresOf(placed: Placed): Square[] {
  const span = spanOf(placed);
  const squares: Square[] = [];
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1)
      squares.push({ x: placed.position.x + dx, y: placed.position.y + dy });
  return squares;
}

/** Whether the creature fills this square. */
export function fills(placed: Placed, square: Square): boolean {
  const span = spanOf(placed);
  const { x, y } = placed.position;
  return square.x >= x && square.x < x + span && square.y >= y && square.y < y + span;
}

/** Feet between the nearest squares of two spaces: 0 when they touch the same square. */
export function gapFt(a: Placed, b: Placed): number {
  const along = (start: number, span: number, other: number, otherSpan: number) =>
    Math.max(0, other - (start + span - 1), start - (other + otherSpan - 1));
  const sa = spanOf(a);
  const sb = spanOf(b);
  return (
    SQUARE_FT *
    Math.max(along(a.position.x, sa, b.position.x, sb), along(a.position.y, sa, b.position.y, sb))
  );
}

/** Feet from a square to the nearest square of a space. */
export const gapToSquareFt = (placed: Placed, square: Square): number =>
  gapFt(placed, { position: square, size: 'medium' });
