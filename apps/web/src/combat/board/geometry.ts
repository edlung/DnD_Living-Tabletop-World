import type { Square } from '@ltw/contracts';

/**
 * Pure geometry of the drawn board (docs/STAGE_320_DESIGN.md §5.5, ADR 0034 §7): how large a
 * square is drawn, where a square sits on the board's plane, and how the tilted plane is seen.
 * It places the projection's squares on screen and decides nothing about the rules: distance,
 * range, area and legality stay the server's.
 */

/** Squares across and down, as the encounter's battlefield publishes them. */
export interface Grid {
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The table seen at an angle: the plane turns `angle` degrees about its near edge and is seen
 * with CSS `perspective` (px) from an eye `eye` board-heights above its far edge.
 */
export interface Tilt {
  readonly angle: number;
  readonly perspective: number;
  readonly eye: number;
}

export const TILT: Tilt = { angle: 48, perspective: 1500, eye: 0.55 };

/** Room above the far row for upright figures and pieces, in squares (before perspective). */
export const HEAD_ROOM = 2;
/** Room below the near row for name plates when the board lies flat, in squares. */
export const FOOT_ROOM = 0.6;

/** Whole pixels per square: the smallest a square is drawn, and the largest. */
export interface CellLimits {
  readonly min: number;
  readonly max: number;
}

/** Where the board is drawn for one square size and view. */
export interface BoardLayout {
  readonly cell: number;
  /** The board's plane before any tilt: every square, edge to edge. */
  readonly plane: Size;
  /** What the board takes on screen, including the room for figures and plates. */
  readonly box: Size;
  /** The plane's top edge inside the box (negative when tilted: it turns into the box). */
  readonly planeTop: number;
  /** The CSS perspective origin inside the box; null when flat. */
  readonly origin: Point | null;
  readonly tilt: Tilt | null;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The perspective scale of the far edge: how much narrower it is drawn than the near one. */
function farScale(height: number, tilt: Tilt): number {
  return tilt.perspective / (tilt.perspective + height * Math.sin(radians(tilt.angle)));
}

export function boardLayout(grid: Grid, cell: number, tilt: Tilt | null): BoardLayout {
  const plane = { width: grid.width * cell, height: grid.height * cell };
  if (!tilt) {
    return {
      cell,
      plane,
      box: { width: plane.width, height: Math.ceil(plane.height + FOOT_ROOM * cell) },
      planeTop: 0,
      origin: null,
      tilt: null,
    };
  }
  const theta = radians(tilt.angle);
  const k = farScale(plane.height, tilt);
  const room = Math.ceil(HEAD_ROOM * cell * k);
  const eye = tilt.eye * plane.height;
  // The projected depth: the far edge lands exactly `room` below the box's top.
  const depth =
    plane.height * Math.cos(theta) + (eye * plane.height * Math.sin(theta)) / tilt.perspective;
  const height = Math.ceil(room + depth);
  return {
    cell,
    plane,
    box: { width: plane.width, height },
    planeTop: height - plane.height,
    origin: { x: plane.width / 2, y: room - eye },
    tilt,
  };
}

/**
 * Where a point of the plane (pixels from its far-left corner) is drawn inside the board's box,
 * and how much a figure standing there is scaled by the perspective.
 */
export function projectPoint(
  layout: BoardLayout,
  point: Point,
): Point & { readonly scale: number } {
  const { tilt, origin, plane, box } = layout;
  if (!tilt || !origin) return { x: point.x, y: layout.planeTop + point.y, scale: 1 };
  const theta = radians(tilt.angle);
  const back = point.y - plane.height;
  const y = box.height + back * Math.cos(theta);
  const z = back * Math.sin(theta);
  const scale = tilt.perspective / (tilt.perspective - z);
  return {
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (y - origin.y) * scale,
    scale,
  };
}

/**
 * The largest square size at which the whole board, flat or tilted, fits the space it is
 * given, within the limits. A board that cannot fit at the smallest size is drawn at it, and
 * its container scrolls.
 */
export function fitCell(space: Size, grid: Grid, tilt: Tilt | null, limits: CellLimits): number {
  for (let cell = limits.max; cell > limits.min; cell -= 1) {
    const { box } = boardLayout(grid, cell, tilt);
    if (box.width <= space.width && box.height <= space.height) return cell;
  }
  return limits.min;
}

/** The centre of a square on the plane, in pixels from its far-left corner. */
export function squareCenter(square: Square, cell: number): Point {
  return { x: (square.x + 0.5) * cell, y: (square.y + 0.5) * cell };
}

/** The square under a point of the plane, or null outside the board. */
export function squareAt(point: Point, cell: number, grid: Grid): Square | null {
  const x = Math.floor(point.x / cell);
  const y = Math.floor(point.y / cell);
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height ? { x, y } : null;
}

/** The plane's CSS transform: turned about its near edge when tilted. */
export const planeTransform = (tilt: Tilt | null): string =>
  tilt ? `rotateX(${String(tilt.angle)}deg)` : 'none';

/** Figures and pieces stand upright on the tilted plane, turned back about their base. */
export const uprightTransform = (tilt: Tilt | null): string =>
  tilt ? `rotateX(${String(-tilt.angle)}deg)` : 'none';
