import { Matrix4, Quaternion, Vector3 } from 'three';
import { simulate } from '../../../../apps/web/src/dice/engine/simulate.ts';
import { topSlot } from '../../../../apps/web/src/dice/engine/landing.ts';

// Align an entire regular solid through one of its rotational symmetries. The
// engraving is fixed before the first frame, including the opposite faces.
export function faceBasis(solid, slot) {
  const face = solid.faces[slot],
    normal = new Vector3(...solid.normals[slot]);
  const center = new Vector3();
  for (const v of face) center.add(new Vector3(...solid.vertices[v]));
  center.divideScalar(face.length);
  const tangent = new Vector3(...solid.vertices[face[0]]).sub(center).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(tangent, new Vector3().crossVectors(normal, tangent), normal),
  );
}

export function planThrow(solid, value, bounds, from, toward, random) {
  const { width: w, depth: d, radius } = bounds;
  const clamp = (n, limit) => Math.min(limit, Math.max(-limit, n));
  const x = clamp(from.x, w / 2 - radius - 0.6),
    z = clamp(from.z, d / 2 - radius - 0.6);
  const dx = toward.x - x,
    dz = toward.z - z,
    distance = Math.hypot(dx, dz) || 1;
  // The large mat covers more ground per physics unit on a long sweep.
  const unit = 1 - 0.25 * Math.min(1, distance / (w * 0.66));
  const walls = [
    { x: (-w * unit) / 2, z: 0, nx: 1, nz: 0 },
    { x: (w * unit) / 2, z: 0, nx: -1, nz: 0 },
    { x: 0, z: (-d * unit) / 2, nx: 0, nz: 1 },
    { x: 0, z: (d * unit) / 2, nx: 0, nz: -1 },
  ];
  const start = { x: x * unit, z: z * unit, towardX: toward.x * unit, towardZ: toward.z * unit };
  const room = (coordinate, delta, span) =>
    delta === 0
      ? Infinity
      : ((Math.sign(delta) * (span / 2 - radius) - coordinate) * distance) / delta;
  const run = Math.min(distance * 0.58, w * 0.39, 0.7 * room(x, dx, w), 0.7 * room(z, dz, d));
  let path,
    best = -Infinity;
  // Keep a flat landing and sufficient travel for this gesture and the available run to the rail.
  for (let i = 0; i < 6; i++) {
    const trial = simulate([{ kind: solid.kind, size: radius * unit }], walls, start, random);
    const rotation = trial.finalRotations[0],
      top = topSlot(solid, rotation);
    const up = new Vector3(...solid.normals[top]).applyQuaternion(new Quaternion(...rotation)).y;
    const origin = trial.frames[0].positions;
    const travel = Math.max(
      ...trial.frames.map(
        ({ positions: p }) =>
          ((p[0] - origin[0]) * dx + (p[2] - origin[2]) * dz) / (unit * distance),
      ),
    );
    const score = (up > 0.993 ? 1000 : 0) + travel;
    if (score > best) {
      path = trial;
      best = score;
    }
    if (up > 0.993 && travel >= run) break;
  }
  const top = topSlot(solid, path.finalRotations[0]);
  const symmetry = faceBasis(solid, top).multiply(
    faceBasis(solid, solid.labels.indexOf(value)).invert(),
  );
  return { path, symmetry, unit };
}
