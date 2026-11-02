import { describe, expect, it } from 'vitest';

import { landOn, percentile, rotate, topSlot, type Quat } from './landing.ts';
import { solidOf } from './solids.ts';

const turn = (axis: [number, number, number], angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};

describe('landing a die on the server’s value', () => {
  it('rotates vectors like a quaternion', () => {
    const [x, y, z] = rotate(turn([0, 0, 1], Math.PI / 2), [1, 0, 0]);
    expect([x, y, z].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0, 1, 0]);
  });

  it('finds the face on top, and moves the value there with one swap', () => {
    const d6 = solidOf('d6');
    const top = topSlot(d6, [0, 0, 0, 1]);
    // The face whose normal is +y.
    expect(d6.normals[top]).toEqual([0, 1, 0]);
    for (let value = 1; value <= 6; value += 1) {
      const labels = landOn(d6.labels, top, value);
      expect(labels[top]).toBe(value);
      expect([...labels].sort()).toEqual([...d6.labels].sort());
    }
  });

  it('reads a d4 at its highest vertex', () => {
    const d4 = solidOf('d4');
    const top = topSlot(d4, [0, 0, 0, 1]);
    const heights = d4.vertices.map((vertex) => vertex[1]);
    expect(heights[top]).toBe(Math.max(...heights));
  });

  it('splits percentile rolls into tens and units', () => {
    expect(percentile(100)).toEqual({ tens: 0, units: 0 });
    expect(percentile(7)).toEqual({ tens: 0, units: 7 });
    expect(percentile(10)).toEqual({ tens: 1, units: 0 });
    expect(percentile(73)).toEqual({ tens: 7, units: 3 });
  });
});
