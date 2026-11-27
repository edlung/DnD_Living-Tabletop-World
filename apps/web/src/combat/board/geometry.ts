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

/**
 * Where a combatant's name plate is drawn (design §5.5; the Stage 330 part B review): in the
 * plates' layer above every figure, so a figure standing in front never hides the plate of one
 * behind it. Flat, its top edge lies under the medallion (`MEDALLION_FOOT`). Tilted, it never
 * covers its own figure, base or ring (owner, 2026-11-17: the plate hid the figure's feet and
 * base): its top edge lies just under the front of the figure's painted base (`BASE_FRONT`;
 * `figures.css` stands the base in the middle of its square, `.board--tilted .token-figure`),
 * scaled like the figure standing there. Where that would lie over a figure standing in front,
 * the plate rides over its own figure's head instead, unless that covers more of the figures
 * behind or leaves the board past its far edge.
 */
export const FIGURE_BASE = 0.58;
export const BASE_FRONT = 0.8;
export const MEDALLION_FOOT = 0.84;
/** A figure's painted height (`figures.css` `--mini-h` 1.9, less its margin) and width, in squares. */
export const FIGURE_HEIGHT = 1.7;
const FIGURE_WIDTH = 1;
/** A plate's height, in squares, and the gap it keeps from a figure's head. */
const PLATE_HEIGHT = 0.55;
const HEAD_GAP = 0.06;

export interface PlateAnchor extends Point {
  readonly scale: number;
  /** Which edge of the plate lies on the point. */
  readonly edge: 'bottom' | 'top' | 'left' | 'right';
}

/** A combatant standing on the board, for the plates' placement. */
export interface Standing {
  readonly square: Square;
  readonly span: number;
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Where a figure's base stands on screen and the box its body takes there. */
function figureBox(
  layout: BoardLayout,
  { square, span }: Standing,
): Box & { base: Point; scale: number } {
  const x = (square.x + span / 2) * layout.cell;
  const base = projectPoint(layout, { x, y: (square.y + FIGURE_BASE * span) * layout.cell });
  const half = (FIGURE_WIDTH * span * layout.cell * base.scale) / 2;
  return {
    base,
    scale: base.scale,
    left: base.x - half,
    right: base.x + half,
    top: base.y - FIGURE_HEIGHT * span * layout.cell * base.scale,
    bottom: base.y,
  };
}

export function plateAnchor(
  layout: BoardLayout,
  square: Square,
  span = 1,
  others: readonly Standing[] = [],
  room = PLATE_SQUARES,
  besideRows = false,
): PlateAnchor {
  // A figure spanning several squares stands in the middle of them (ADR 0049 §1).
  const x = (square.x + span / 2) * layout.cell;
  if (!layout.tilt) {
    return {
      x,
      y: layout.planeTop + (square.y + MEDALLION_FOOT * span) * layout.cell,
      scale: 1,
      edge: 'top',
    };
  }
  const front = projectPoint(layout, { x, y: (square.y + BASE_FRONT * span) * layout.cell });
  const below: PlateAnchor = { x: front.x, y: front.y, scale: front.scale, edge: 'top' };
  const own = figureBox(layout, { square, span });
  if (
    besideRows &&
    span === 1 &&
    others.some(({ square: at }) => at.x === square.x && Math.abs(at.y - square.y) === 1)
  ) {
    // In a column of tall miniatures, name each at its own base, towards open ground.
    const columns = layout.plane.width / layout.cell;
    const right = square.x < columns / 2;
    const start = right ? square.x + 1 : square.x - room;
    const end = right ? start + room : square.x;
    const free =
      start >= 0 &&
      end <= columns &&
      !others.some(
        ({ square: at, span: size }) =>
          at.y <= square.y && at.y + size > square.y && at.x < end && at.x + size > start,
      );
    if (free)
      return {
        x: own.base.x + (right ? 1 : -1) * layout.cell * own.scale * 0.65,
        y: own.base.y,
        scale: own.scale,
        edge: right ? 'left' : 'right',
      };
  }
  const headY = own.top - HEAD_GAP * layout.cell * own.scale;
  const above: PlateAnchor = { x: own.base.x, y: headY, scale: own.scale, edge: 'bottom' };
  const plateBox = (anchor: PlateAnchor): Box => {
    const half = (room * layout.cell * anchor.scale) / 2;
    const height = PLATE_HEIGHT * layout.cell * anchor.scale;
    const top = anchor.edge === 'top' ? anchor.y : anchor.y - height;
    return { left: anchor.x - half, right: anchor.x + half, top, bottom: top + height };
  };
  const figures = others
    .filter((other) => other.square.x !== square.x || other.square.y !== square.y)
    .map((other) => figureBox(layout, other));
  const covered = (anchor: PlateAnchor) =>
    figures.reduce((sum, figure) => sum + overlap(plateBox(anchor), figure), 0);
  const under = covered(below);
  if (under === 0) return below;
  // Over the head only while the plate stays over the board, below its far edge: above it lie
  // the board's view controls.
  const farEdge = projectPoint(layout, { x, y: 0 }).y;
  return plateBox(above).top >= farEdge && covered(above) < under ? above : below;
}

/** The widest a plate is drawn, in squares; its words shorten first, never its number. */
export const PLATE_SQUARES = 2.4;

/**
 * How wide a combatant's plate may be, in squares: at most `PLATE_SQUARES`, and no wider than the
 * distance to the nearest combatant in the same row (less a hairline), so plates side by side
 * never cover each other. Rows are a whole square apart flat, and as far as their figures tilted.
 */
export function plateRoom(square: Square, occupied: readonly Square[]): number {
  let room = PLATE_SQUARES;
  for (const other of occupied) {
    const apart = Math.abs(other.x - square.x);
    if (other.y === square.y && apart > 0) room = Math.min(room, apart - 0.1);
  }
  return room;
}

/** The plane's CSS transform: turned about its near edge when tilted. */
export const planeTransform = (tilt: Tilt | null): string =>
  tilt ? `rotateX(${String(tilt.angle)}deg)` : 'none';

/** Figures and pieces stand upright on the tilted plane, turned back about their base. */
export const uprightTransform = (tilt: Tilt | null): string =>
  tilt ? `rotateX(${String(-tilt.angle)}deg)` : 'none';
