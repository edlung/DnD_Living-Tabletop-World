import { dot, type Solid, type Vec3 } from './solids.ts';

/** A rotation as a unit quaternion (x, y, z, w), as three.js and cannon-es store it. */
export type Quat = readonly [number, number, number, number];

/** Rotates a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

const UP: Vec3 = [0, 1, 0];

/**
 * Which label slot ends on top for a die at rest: the face whose normal points most nearly up,
 * or for a d4 the highest vertex (the number read at the apex).
 */
export function topSlot(solid: Solid, rotation: Quat): number {
  const directions = solid.vertexLabels ? solid.vertices : solid.normals;
  let best = 0;
  let most = -Infinity;
  for (const [index, direction] of directions.entries()) {
    const up = dot(rotate(rotation, direction), UP);
    if (up > most) {
      most = up;
      best = index;
    }
  }
  return best;
}

/**
 * The die's labels with `value` moved to the slot that lands on top: it trades places with the
 * label that was there. One swap is invisible at a glance and keeps every number on the die once.
 */
export function landOn(labels: readonly number[], top: number, value: number): number[] {
  const from = labels.indexOf(value);
  if (from < 0) throw new Error(`no face shows ${String(value)}`);
  const next = [...labels];
  next[from] = labels[top] ?? value;
  next[top] = value;
  return next;
}

/** A d100 roll as its two d10s: the tens die (00–90) and the units die (0–9); 100 is 00 and 0. */
export function percentile(value: number): { readonly tens: number; readonly units: number } {
  const units = value % 10;
  const tens = value === 100 ? 0 : value - units;
  return { tens: tens / 10, units };
}

/** The label a d10 face slot shows for a value: 10 is shown as 0. */
export const d10Label = (value: number): number => value % 10;
