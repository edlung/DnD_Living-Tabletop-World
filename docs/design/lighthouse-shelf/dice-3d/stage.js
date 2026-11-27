import { Quaternion, Vector3 } from 'three';
import { solidOf } from '../../../../apps/web/src/dice/engine/solids.ts';
import { topSlot } from '../../../../apps/web/src/dice/engine/landing.ts';
import { dieMesh } from '../../../../apps/web/src/dice/engine/mesh.ts';
import { faceCanvases } from './faces.js';
import { faceBasis, planThrow } from './geometry.js';
import { createView } from './view.js';

export async function createStage(surface, sides, initialValue) {
  const solid = solidOf(sides === 6 ? 'd6' : 'd20');
  const aspect = surface.clientWidth / Math.max(surface.clientHeight, 1);
  const bounds = { width: Math.max(11, Math.min(24, aspect * 10.5)), depth: 9.4, radius: 1.4 };
  const { geometry, cornerUvs } = dieMesh(solid, bounds.radius);
  const faces = await faceCanvases(solid, cornerUvs);
  if (!surface.isConnected) {
    geometry.dispose();
    return null;
  }
  const view = createView(surface, geometry, faces, bounds);
  const { mesh } = view;
  const positions = geometry.getAttribute('position'),
    corners = [];
  const unique = new Set();
  for (let i = 0; i < positions.count; i++) {
    const point = new Vector3().fromBufferAttribute(positions, i),
      key = point.toArray().join(',');
    if (!unique.has(key)) {
      unique.add(key);
      corners.push(point);
    }
  }
  const localUp = new Vector3(),
    inverse = new Quaternion();
  const top = solid.labels.indexOf(initialValue);
  // In this frame the bearing (tangent) is horizontal and the face normal is up.
  const horizontal = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  mesh.quaternion.copy(horizontal).multiply(faceBasis(solid, top).invert());
  if (sides === 20)
    mesh.quaternion.premultiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    );
  const vertex = solid.vertices[solid.faces[top][0]],
    n = solid.normals[top];
  const support =
    (bounds.radius * (vertex[0] * n[0] + vertex[1] * n[1] + vertex[2] * n[2])) /
    Math.hypot(...vertex);
  mesh.position.set(-bounds.width * 0.24, support, 0.5);
  surface.dataset.state = 'ready';
  surface.dataset.face = String(initialValue);
  view.draw();
  let frame = 0,
    closed = false;
  const nextQuaternion = new Quaternion();
  function roll(value, gesture, reduced, settle, random = Math.random) {
    cancelAnimationFrame(frame);
    const from = gesture
      ? view.onTable(...gesture.from)
      : { x: -bounds.width * 0.39, z: bounds.depth * (0.17 + random() * 0.15) };
    const toward = gesture
      ? view.onTable(...gesture.to)
      : { x: bounds.width * 0.35, z: -bounds.depth * (0.15 + random() * 0.15) };
    const { path, symmetry, unit } = planThrow(solid, value, bounds, from, toward, random);
    surface.dataset.state = 'rolling';
    delete surface.dataset.face;
    const end = path.frames.length - 1;
    const seconds = Math.min(4.25, end / path.frameRate);
    function drawAt(exact) {
      const a = path.frames[Math.floor(exact)],
        b = path.frames[Math.min(end, Math.floor(exact) + 1)],
        mix = exact - Math.floor(exact);
      mesh.position.set(...a.positions);
      mesh.position.x += (b.positions[0] - mesh.position.x) * mix;
      mesh.position.y += (b.positions[1] - mesh.position.y) * mix;
      mesh.position.z += (b.positions[2] - mesh.position.z) * mix;
      mesh.position.divideScalar(unit);
      mesh.quaternion
        .fromArray(a.rotations)
        .slerp(nextQuaternion.fromArray(b.rotations), mix)
        .multiply(symmetry);
      // The shared collision hull is inset by 4%. Keep the visible bevel on the tabletop.
      localUp.set(0, 1, 0).applyQuaternion(inverse.copy(mesh.quaternion).invert());
      for (const corner of corners)
        mesh.position.y = Math.max(mesh.position.y, -corner.dot(localUp));
      view.draw();
    }
    function finish() {
      const visible = solid.labels[topSlot(solid, mesh.quaternion.toArray())];
      surface.dataset.state = 'settled';
      surface.dataset.face = String(visible);
      settle(visible);
    }
    if (reduced) {
      drawAt(end);
      finish();
      return;
    }
    const start = performance.now();
    function tick(now) {
      if (closed) return;
      const t = Math.max(0, Math.min(1, (now - start) / (seconds * 1000)));
      drawAt(t * end);
      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    }
    drawAt(0);
    frame = requestAnimationFrame(tick);
  }
  return {
    roll,
    dispose() {
      closed = true;
      cancelAnimationFrame(frame);
      view.dispose();
    },
  };
}
