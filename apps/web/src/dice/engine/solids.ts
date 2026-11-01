/**
 * The dice as solids (Stage 510): vertices, faces in counter-clockwise order seen from outside, and
 * the number each face (a d4: each vertex) shows. Pure math, so it is tested without a renderer.
 * Opposite faces add up as on real dice (n + 1; a d10's 0–9 to 9).
 */
export type Vec3 = readonly [number, number, number];
export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface Solid {
  readonly kind: DieKind;
  readonly vertices: readonly Vec3[];
  /** Each face's vertex indices, counter-clockwise seen from outside. */
  readonly faces: readonly (readonly number[])[];
  /** Unit outward normal of each face. */
  readonly normals: readonly Vec3[];
  /**
   * The number each face shows (d6–d20), or each vertex shows (d4: the number at the top vertex
   * is the roll). Values run 1..n; a d10 shows 0..9.
   */
  readonly labels: readonly number[];
  /** Whether the labels belong to vertices (the d4) rather than faces. */
  readonly vertexLabels: boolean;
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** The centre, and a stand-in for a missing point. */
export const ORIGIN: Vec3 = [0, 0, 0];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

export function centroid(points: readonly Vec3[]): Vec3 {
  const total = points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]);
  return scale(total, 1 / points.length);
}

/** Orders a convex face's vertices counter-clockwise around its outward normal. */
function ordered(vertices: readonly Vec3[], face: readonly number[]): number[] {
  const points = face.map((index) => vertices[index] ?? ORIGIN);
  const center = centroid(points);
  const normal = normalize(center);
  const first = normalize(sub(points[0] ?? center, center));
  const second = cross(normal, first);
  const angle = (index: number) => {
    const offset = sub(vertices[index] ?? center, center);
    return Math.atan2(dot(offset, second), dot(offset, first));
  };
  return [...face].sort((a, b) => angle(a) - angle(b));
}

/** The faces of a convex solid centred on the origin, one per outward normal given. */
function facesFromNormals(vertices: readonly Vec3[], normals: readonly Vec3[]): number[][] {
  return normals.map((normal) => {
    const reach = vertices.map((vertex) => dot(vertex, normal));
    const most = Math.max(...reach);
    const face = reach.flatMap((value, index) => (Math.abs(value - most) < 1e-6 ? [index] : []));
    return ordered(vertices, face);
  });
}

function faceNormal(vertices: readonly Vec3[], face: readonly number[]): Vec3 {
  return normalize(centroid(face.map((index) => vertices[index] ?? ORIGIN)));
}

/**
 * Numbers for faces so opposite faces add up to `sum`: faces are paired by opposite normals, and
 * each pair takes the next smallest number and its complement.
 */
function oppositeLabels(normals: readonly Vec3[], first: number, sum: number): number[] {
  const labels: number[] = Array.from({ length: normals.length }, () => -1);
  let next = first;
  for (const [index, normal] of normals.entries()) {
    if ((labels[index] ?? -1) >= 0) continue;
    const opposite = normals.findIndex((other) => dot(other, normal) < -0.999);
    labels[index] = next;
    if (opposite >= 0) labels[opposite] = sum - next;
    next += 1;
  }
  return labels;
}

const plusMinus = [1, -1] as const;

function cube(): Solid {
  const vertices: Vec3[] = [];
  for (const x of plusMinus)
    for (const y of plusMinus) for (const z of plusMinus) vertices.push([x, y, z]);
  const normals: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  return {
    kind: 'd6',
    vertices,
    faces: facesFromNormals(vertices, normals),
    normals,
    labels: oppositeLabels(normals, 1, 7),
    vertexLabels: false,
  };
}

function tetrahedron(): Solid {
  const vertices: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  // Each face is opposite a vertex.
  const normals = vertices.map((vertex) => normalize(scale(vertex, -1)));
  return {
    kind: 'd4',
    vertices,
    faces: facesFromNormals(vertices, normals),
    normals,
    labels: [1, 2, 3, 4],
    vertexLabels: true,
  };
}

function octahedron(): Solid {
  const vertices: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const normals: Vec3[] = [];
  for (const x of plusMinus)
    for (const y of plusMinus)
      for (const z of plusMinus) {
        normals.push(normalize([x, y, z]));
      }
  return {
    kind: 'd8',
    vertices,
    faces: facesFromNormals(vertices, normals),
    normals,
    labels: oppositeLabels(normals, 1, 9),
    vertexLabels: false,
  };
}

function icosahedronVertices(): Vec3[] {
  const vertices: Vec3[] = [];
  for (const a of plusMinus)
    for (const b of plusMinus) {
      vertices.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    }
  return vertices;
}

function dodecahedronVertices(): Vec3[] {
  const vertices: Vec3[] = [];
  for (const x of plusMinus)
    for (const y of plusMinus) for (const z of plusMinus) vertices.push([x, y, z]);
  for (const a of plusMinus)
    for (const b of plusMinus) {
      vertices.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
    }
  return vertices;
}

function dodecahedron(): Solid {
  const vertices = dodecahedronVertices();
  // A dodecahedron's faces point at an icosahedron's vertices, in one of its two orientations:
  // keep the directions that touch five vertices.
  const candidates: Vec3[] = [];
  for (const a of plusMinus)
    for (const b of plusMinus) {
      for (const [u, v] of [
        [1, PHI],
        [PHI, 1],
      ] as const) {
        candidates.push([0, a * u, b * v], [a * u, b * v, 0], [b * v, 0, a * u]);
      }
    }
  const faces = facesFromNormals(vertices, candidates.map(normalize)).filter(
    (face) => face.length === 5,
  );
  const normals = faces.map((face) => faceNormal(vertices, face));
  return {
    kind: 'd12',
    vertices,
    faces,
    normals,
    labels: oppositeLabels(normals, 1, 13),
    vertexLabels: false,
  };
}

/** Every triangle of three vertices a whole edge apart from each other (the icosahedron's faces). */
function trianglesByEdge(vertices: readonly Vec3[], edge: number): number[][] {
  const apart = (a: number, b: number) =>
    Math.abs(length(sub(vertices[a] ?? ORIGIN, vertices[b] ?? ORIGIN)) - edge) < 1e-6;
  const faces: number[][] = [];
  for (let a = 0; a < vertices.length; a += 1) {
    for (let b = a + 1; b < vertices.length; b += 1) {
      if (!apart(a, b)) continue;
      for (let c = b + 1; c < vertices.length; c += 1) {
        if (apart(a, c) && apart(b, c)) faces.push(ordered(vertices, [a, b, c]));
      }
    }
  }
  return faces;
}

function icosahedron(): Solid {
  const vertices = icosahedronVertices();
  const faces = trianglesByEdge(vertices, 2);
  const normals = faces.map((face) => faceNormal(vertices, face));
  return {
    kind: 'd20',
    vertices,
    faces,
    normals,
    labels: oppositeLabels(normals, 1, 21),
    vertexLabels: false,
  };
}

/**
 * The pentagonal trapezohedron: two apexes and a zig-zag ring. The ring's height makes every kite
 * planar for apexes at ±1 (h = 9.4721 a; Stage 510 notes).
 */
function trapezohedron(): Solid {
  const ring = 0.10557;
  const top: Vec3 = [0, 1, 0];
  const bottom: Vec3 = [0, -1, 0];
  const vertices: Vec3[] = [top, bottom];
  for (let k = 0; k < 10; k += 1) {
    const angle = (k * Math.PI) / 5;
    vertices.push([Math.cos(angle), k % 2 === 0 ? ring : -ring, Math.sin(angle)]);
  }
  const at = (k: number) => 2 + (((k % 10) + 10) % 10);
  const faces: number[][] = [];
  for (let i = 0; i < 5; i += 1) {
    faces.push(ordered(vertices, [0, at(2 * i), at(2 * i + 1), at(2 * i + 2)]));
    faces.push(ordered(vertices, [1, at(2 * i + 1), at(2 * i + 2), at(2 * i + 3)]));
  }
  const normals = faces.map((face) => {
    const points = face.map((index) => vertices[index] ?? top);
    const [a, b, c] = points;
    const raw = normalize(cross(sub(b ?? top, a ?? top), sub(c ?? top, a ?? top)));
    // Outward: away from the centre.
    return dot(raw, centroid(points)) < 0 ? scale(raw, -1) : raw;
  });
  return {
    kind: 'd10',
    vertices,
    faces,
    normals,
    labels: oppositeLabels(normals, 0, 9),
    vertexLabels: false,
  };
}

const BUILDERS: Readonly<Record<DieKind, () => Solid>> = {
  d4: tetrahedron,
  d6: cube,
  d8: octahedron,
  d10: trapezohedron,
  d12: dodecahedron,
  d20: icosahedron,
};

const cache = new Map<DieKind, Solid>();

/** The solid of a die, built once. */
export function solidOf(kind: DieKind): Solid {
  const known = cache.get(kind);
  if (known) return known;
  const built = BUILDERS[kind]();
  cache.set(kind, built);
  return built;
}

/** Each face's normal reported per face index (for checks): recomputed from the vertices. */
export const recomputedNormal = (solid: Solid, face: number): Vec3 =>
  faceNormal(solid.vertices, solid.faces[face] ?? []);
