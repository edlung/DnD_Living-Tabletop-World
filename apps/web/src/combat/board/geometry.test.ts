import { describe, expect, it } from 'vitest';

import {
  boardLayout,
  FIGURE_BASE,
  fitCell,
  FOOT_ROOM,
  MEDALLION_FOOT,
  planeTransform,
  plateAnchor,
  plateRoom,
  PLATE_SQUARES,
  projectPoint,
  squareAt,
  squareCenter,
  TILT,
  uprightTransform,
  type Tilt,
} from './geometry.ts';

const grid = { width: 16, height: 12 };
const limits = { min: 28, max: 72 };

describe('the flat board', () => {
  it('is the plane itself, with room below the near row for name plates', () => {
    const layout = boardLayout(grid, 40, null);
    expect(layout.plane).toEqual({ width: 640, height: 480 });
    expect(layout.box).toEqual({ width: 640, height: Math.ceil(480 + FOOT_ROOM * 40) });
    expect(layout.planeTop).toBe(0);
    expect(layout.origin).toBeNull();
    expect(projectPoint(layout, { x: 100, y: 200 })).toEqual({ x: 100, y: 200, scale: 1 });
  });
});

describe('the tilted board', () => {
  const layout = boardLayout(grid, 48, TILT);
  const { width, height } = layout.plane;

  it('keeps the near edge at full width along the bottom of its box', () => {
    for (const x of [0, width]) {
      const near = projectPoint(layout, { x, y: height });
      expect(near.x).toBeCloseTo(x, 6);
      expect(near.y).toBeCloseTo(layout.box.height, 6);
      expect(near.scale).toBeCloseTo(1, 9);
    }
  });

  it('draws the far edge narrower, centred, with room above it for standing figures', () => {
    const left = projectPoint(layout, { x: 0, y: 0 });
    const right = projectPoint(layout, { x: width, y: 0 });
    expect(left.y).toBeCloseTo(right.y, 6);
    expect(left.y).toBeGreaterThan(0);
    expect(left.y).toBeLessThanOrEqual(2 * 48);
    expect(left.scale).toBeLessThan(1);
    expect(right.x - left.x).toBeCloseTo(width * left.scale, 6);
    expect((left.x + right.x) / 2).toBeCloseTo(width / 2, 6);
    expect(layout.box.width).toBe(width);
  });

  it('draws nearer rows lower and larger, so figures in front stand in front', () => {
    const rows = [0, 3, 6, 9, 12].map((row) =>
      projectPoint(layout, squareCenter({ x: 4, y: row }, 48)),
    );
    for (let index = 1; index < rows.length; index += 1) {
      const [before, after] = [rows[index - 1], rows[index]];
      expect(after?.y).toBeGreaterThan(before?.y ?? Infinity);
      expect(after?.scale).toBeGreaterThan(before?.scale ?? Infinity);
    }
  });

  it('is shorter on screen than the flat board, and steeper with a higher eye', () => {
    expect(layout.box.height).toBeLessThan(boardLayout(grid, 48, null).box.height);
    const higher: Tilt = { ...TILT, eye: TILT.eye + 0.5 };
    expect(boardLayout(grid, 48, higher).box.height).toBeGreaterThan(layout.box.height);
  });

  it('turns the plane about its near edge and stands figures back upright', () => {
    expect(planeTransform(TILT)).toBe(`rotateX(${String(TILT.angle)}deg)`);
    expect(uprightTransform(TILT)).toBe(`rotateX(${String(-TILT.angle)}deg)`);
    expect(planeTransform(null)).toBe('none');
    expect(uprightTransform(null)).toBe('none');
  });
});

describe('fitting the board to its space', () => {
  it('chooses the largest square size at which the whole board fits', () => {
    for (const tilt of [null, TILT]) {
      const space = { width: 760, height: 560 };
      const cell = fitCell(space, grid, tilt, limits);
      const { box } = boardLayout(grid, cell, tilt);
      expect(box.width).toBeLessThanOrEqual(space.width);
      expect(box.height).toBeLessThanOrEqual(space.height);
      const larger = boardLayout(grid, cell + 1, tilt).box;
      expect(larger.width > space.width || larger.height > space.height).toBe(true);
    }
  });

  it('lets a tilted board use more of a wide, low space than a flat one', () => {
    const space = { width: 1100, height: 520 };
    expect(fitCell(space, grid, TILT, limits)).toBeGreaterThan(fitCell(space, grid, null, limits));
  });

  it('stays within the limits: a board too large for its space is drawn at the smallest size', () => {
    expect(fitCell({ width: 300, height: 300 }, grid, null, limits)).toBe(limits.min);
    expect(fitCell({ width: 5000, height: 5000 }, grid, TILT, limits)).toBe(limits.max);
  });
});

describe('squares and pixels', () => {
  it('finds the square under a point and the centre of a square, each the other’s inverse', () => {
    expect(squareCenter({ x: 2, y: 6 }, 40)).toEqual({ x: 100, y: 260 });
    expect(squareAt({ x: 100, y: 260 }, 40, grid)).toEqual({ x: 2, y: 6 });
    expect(squareAt({ x: 0, y: 0 }, 40, grid)).toEqual({ x: 0, y: 0 });
    expect(squareAt({ x: 639.9, y: 479.9 }, 40, grid)).toEqual({ x: 15, y: 11 });
    for (let x = 0; x < grid.width; x += 1) {
      for (let y = 0; y < grid.height; y += 1) {
        expect(squareAt(squareCenter({ x, y }, 37), 37, grid)).toEqual({ x, y });
      }
    }
  });

  it('finds no square outside the board', () => {
    expect(squareAt({ x: -1, y: 10 }, 40, grid)).toBeNull();
    expect(squareAt({ x: 10, y: 480 }, 40, grid)).toBeNull();
    expect(squareAt({ x: 640, y: 10 }, 40, grid)).toBeNull();
  });
});

describe('name plates', () => {
  it('lie under the medallion when flat, on the figure’s base line scaled with it when tilted', () => {
    const flat = boardLayout(grid, 40, null);
    expect(plateAnchor(flat, { x: 2, y: 6 })).toEqual({
      x: 100,
      y: (6 + MEDALLION_FOOT) * 40,
      scale: 1,
      edge: 'top',
    });
    const tilted = boardLayout(grid, 48, TILT);
    const anchor = plateAnchor(tilted, { x: 2, y: 6 });
    const base = projectPoint(tilted, { x: 2.5 * 48, y: (6 + FIGURE_BASE) * 48 });
    expect(anchor).toEqual({ x: base.x, y: base.y, scale: base.scale, edge: 'bottom' });
    // A plate further back is drawn higher and smaller, like the figure standing there.
    const behind = plateAnchor(tilted, { x: 2, y: 5 });
    expect(behind.y).toBeLessThan(anchor.y);
    expect(behind.scale).toBeLessThan(anchor.scale);
  });

  it('are never wider than the room beside them in their row', () => {
    const ambush = [
      { x: 2, y: 6 },
      { x: 8, y: 4 },
      { x: 10, y: 7 },
      { x: 11, y: 5 },
      { x: 12, y: 6 },
    ];
    for (const square of ambush) expect(plateRoom(square, ambush)).toBe(PLATE_SQUARES);
    const crowded = [
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 6, y: 2 },
      { x: 4, y: 3 },
    ];
    expect(crowded.map((square) => plateRoom(square, crowded))).toEqual([
      0.9,
      0.9,
      1.9,
      PLATE_SQUARES,
    ]);
  });
});
