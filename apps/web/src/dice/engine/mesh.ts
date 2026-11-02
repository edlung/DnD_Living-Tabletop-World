import * as THREE from 'three';

import {
  add,
  centroid,
  cross,
  dot,
  length,
  normalize,
  ORIGIN,
  scale,
  sub,
  type Solid,
  type Vec3,
} from './solids.ts';

/**
 * A die's drawn shape (Stage 510): every face inset in its own plane, and the gaps between them
 * closed by chamfer strips along the edges and caps at the corners, shaded smoothly from one face's
 * normal to the next, so the edges catch the light like rounded, gilded edges. Each face is its own
 * group (its label's material); the chamfers share the last group (the gold).
 */
export interface DieMesh {
  readonly geometry: THREE.BufferGeometry;
  /** Per face: where each corner of the face lies in its label texture (u, v). */
  readonly cornerUvs: readonly (readonly [number, number][])[];
}

/** How much of each face the chamfer takes, from its corners toward its centre. */
const BEVEL = 0.16;

export function dieMesh(solid: Solid, size: number): DieMesh {
  const radius = Math.max(...solid.vertices.map(length));
  const k = size / radius;
  const corners = solid.vertices.map((vertex) => scale(vertex, k));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  let count = 0;
  const push = (point: Vec3, normal: Vec3, uv: readonly [number, number]) => {
    positions.push(...point);
    normals.push(...normal);
    uvs.push(...uv);
    count += 1;
  };

  // Faces, inset toward their centres; their texture spans the face's own shape.
  const inset = solid.faces.map((face) => {
    const points = face.map((index) => corners[index] ?? ORIGIN);
    const center = centroid(points);
    return points.map((point) => add(center, scale(sub(point, center), 1 - BEVEL)));
  });
  const cornerUvs = solid.faces.map((_, index) => {
    const points = inset[index] ?? [];
    const normal = solid.normals[index] ?? [0, 1, 0];
    const center = centroid(points);
    const first = normalize(sub(points[0] ?? center, center));
    const second = cross(normal, first);
    const reach = Math.max(...points.map((point) => length(sub(point, center))));
    return points.map((point): [number, number] => {
      const offset = sub(point, center);
      return [
        0.5 + (0.48 * dot(offset, first)) / reach,
        0.5 + (0.48 * dot(offset, second)) / reach,
      ];
    });
  });
  for (const [index, points] of inset.entries()) {
    const start = count;
    const normal = solid.normals[index] ?? [0, 1, 0];
    const uv = cornerUvs[index] ?? [];
    for (let corner = 1; corner < points.length - 1; corner += 1) {
      for (const at of [0, corner, corner + 1])
        push(points[at] ?? ORIGIN, normal, uv[at] ?? [0.5, 0.5]);
    }
    geometry.addGroup(start, count - start, index);
  }

  // Chamfers: along every edge between two faces, and a cap at every corner.
  const bevelStart = count;
  const facesOf = (vertex: number) =>
    solid.faces.flatMap((face, index) => (face.includes(vertex) ? [index] : []));
  const insetCorner = (faceIndex: number, vertex: number): Vec3 => {
    const face = solid.faces[faceIndex] ?? [];
    return inset[faceIndex]?.[face.indexOf(vertex)] ?? ORIGIN;
  };
  const triangle = (points: readonly Vec3[], pointNormals: readonly Vec3[]) => {
    const [a, b, c] = points;
    if (!a || !b || !c) return;
    const outward = dot(cross(sub(b, a), sub(c, a)), centroid([a, b, c])) >= 0;
    const order = outward ? [0, 1, 2] : [0, 2, 1];
    for (const at of order) push(points[at] ?? a, pointNormals[at] ?? [0, 1, 0], [0, 0]);
  };
  for (const [faceIndex, face] of solid.faces.entries()) {
    for (const [corner, a] of face.entries()) {
      const b = face[(corner + 1) % face.length] ?? a;
      // Each edge once: from the face where it runs a → b to its neighbour where it runs b → a.
      const neighbour = solid.faces.findIndex(
        (other, index) =>
          index !== faceIndex &&
          other.includes(a) &&
          other.includes(b) &&
          other[(other.indexOf(b) + 1) % other.length] === a,
      );
      if (neighbour < faceIndex) continue;
      const here = solid.normals[faceIndex] ?? [0, 1, 0];
      const there = solid.normals[neighbour] ?? [0, 1, 0];
      const quad = [
        insetCorner(faceIndex, a),
        insetCorner(faceIndex, b),
        insetCorner(neighbour, b),
        insetCorner(neighbour, a),
      ];
      const quadNormals = [here, here, there, there];
      triangle(
        [quad[0], quad[1], quad[2]] as Vec3[],
        [quadNormals[0], quadNormals[1], quadNormals[2]] as Vec3[],
      );
      triangle(
        [quad[0], quad[2], quad[3]] as Vec3[],
        [quadNormals[0], quadNormals[2], quadNormals[3]] as Vec3[],
      );
    }
  }
  for (const [vertex, point] of corners.entries()) {
    const around = facesOf(vertex);
    const direction = normalize(point);
    const first = normalize(sub(insetCorner(around[0] ?? 0, vertex), point));
    const second = cross(direction, first);
    const ring = around
      .map((faceIndex) => ({
        point: insetCorner(faceIndex, vertex),
        normal: solid.normals[faceIndex] ?? direction,
      }))
      .sort((p, q) => {
        const angle = (at: Vec3) => {
          const offset = sub(at, point);
          return Math.atan2(dot(offset, second), dot(offset, first));
        };
        return angle(p.point) - angle(q.point);
      });
    for (let at = 1; at < ring.length - 1; at += 1) {
      const a = ring[0];
      const b = ring[at];
      const c = ring[at + 1];
      if (a && b && c) triangle([a.point, b.point, c.point], [a.normal, b.normal, c.normal]);
    }
  }
  geometry.addGroup(bevelStart, count - bevelStart, solid.faces.length);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return { geometry, cornerUvs };
}
