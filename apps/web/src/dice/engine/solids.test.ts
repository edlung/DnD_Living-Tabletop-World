import { describe, expect, it } from 'vitest';

import { centroid, cross, dot, normalize, ORIGIN, solidOf, sub, type DieKind } from './solids.ts';

const SIDES: Readonly<Record<DieKind, { faces: number; corners: number; first: number }>> = {
  d4: { faces: 4, corners: 3, first: 1 },
  d6: { faces: 6, corners: 4, first: 1 },
  d8: { faces: 8, corners: 3, first: 1 },
  d10: { faces: 10, corners: 4, first: 0 },
  d12: { faces: 12, corners: 5, first: 1 },
  d20: { faces: 20, corners: 3, first: 1 },
};

describe('the dice as solids', () => {
  for (const [kind, expected] of Object.entries(SIDES) as [DieKind, (typeof SIDES)[DieKind]][]) {
    it(`builds a ${kind} with planar, outward, counter-clockwise faces`, () => {
      const solid = solidOf(kind);
      expect(solid.faces).toHaveLength(expected.faces);
      for (const [index, face] of solid.faces.entries()) {
        expect(face).toHaveLength(expected.corners);
        const points = face.map((vertex) => solid.vertices[vertex] ?? ORIGIN);
        const normal = solid.normals[index] ?? ORIGIN;
        // Outward, and every corner in the face's plane.
        expect(dot(normal, centroid(points))).toBeGreaterThan(0);
        const plane = dot(normal, points[0] ?? ORIGIN);
        for (const point of points) expect(dot(normal, point)).toBeCloseTo(plane, 4);
        // Counter-clockwise seen from outside: each turn agrees with the normal.
        for (let corner = 0; corner < points.length; corner += 1) {
          const a = points[corner] ?? ORIGIN;
          const b = points[(corner + 1) % points.length] ?? ORIGIN;
          const c = points[(corner + 2) % points.length] ?? ORIGIN;
          expect(dot(normalize(cross(sub(b, a), sub(c, b))), normal)).toBeGreaterThan(0.5);
        }
      }
    });

    it(`numbers a ${kind} like a real die`, () => {
      const solid = solidOf(kind);
      const labels = [...solid.labels].sort((a, b) => a - b);
      const count = solid.vertexLabels ? solid.vertices.length : solid.faces.length;
      expect(labels).toEqual(Array.from({ length: count }, (_, index) => expected.first + index));
      if (!solid.vertexLabels) {
        const sum = expected.first === 0 ? count - 1 : count + 1;
        for (const [index, normal] of solid.normals.entries()) {
          const opposite = solid.normals.findIndex((other) => dot(other, normal) < -0.999);
          if (opposite >= 0)
            expect((solid.labels[index] ?? 0) + (solid.labels[opposite] ?? 0)).toBe(sum);
        }
      }
    });
  }
});
