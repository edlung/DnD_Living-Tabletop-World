import * as CANNON from 'cannon-es';

import type { Quat } from './landing.ts';
import { solidOf, type DieKind } from './solids.ts';

/**
 * The throw, simulated before it is shown (Stage 510): rigid dice with cannon-es on the table
 * (y = 0) inside the screen's walls. The whole path is recorded first — frames at 60 per second and
 * every bounce with its speed — so the labels can be set for the server's values before anything
 * moves, and the sound can follow each bounce.
 */
export interface Wall {
  /** A point on the wall, on the table. */
  readonly x: number;
  readonly z: number;
  /** The wall's inward normal on the table. */
  readonly nx: number;
  readonly nz: number;
}

export interface Hit {
  /** Seconds after the throw. */
  readonly time: number;
  readonly die: number;
  /** Impact speed along the contact normal. */
  readonly speed: number;
  /** Where on the table, for panning (table units). */
  readonly x: number;
  readonly withDie: boolean;
}

export interface Simulation {
  readonly frameRate: number;
  /** Per frame: each die's position (x, y, z) and rotation (x, y, z, w). */
  readonly frames: readonly {
    readonly positions: Float32Array;
    readonly rotations: Float32Array;
  }[];
  readonly hits: readonly Hit[];
  readonly finalRotations: readonly Quat[];
}

const STEP = 1 / 120;
const FRAME_EVERY = 2;
const MAX_SECONDS = 5;
const GRAVITY = 48;
/** A die's resting check: below these speeds for this long ends the throw. */
const REST_SPEED = 0.18;
const REST_FOR = 0.2;

export interface ThrowSpec {
  readonly kind: DieKind;
  /** The die's radius in table units. */
  readonly size: number;
}

/** A die's collision shape: its solid, a little inside the drawn one's chamfered corners. */
function shapeOf(kind: DieKind, size: number): CANNON.ConvexPolyhedron {
  const solid = solidOf(kind);
  const radius = Math.max(...solid.vertices.map((v) => Math.hypot(v[0], v[1], v[2])));
  const k = (size * 0.96) / radius;
  return new CANNON.ConvexPolyhedron({
    vertices: solid.vertices.map((v) => new CANNON.Vec3(v[0] * k, v[1] * k, v[2] * k)),
    faces: solid.faces.map((face) => [...face]),
  });
}

export function simulate(
  dice: readonly ThrowSpec[],
  walls: readonly Wall[],
  start: {
    readonly x: number;
    readonly z: number;
    readonly towardX: number;
    readonly towardZ: number;
  },
  random: () => number,
): Simulation {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  // A die that has nearly stopped sleeps, so a jitter against a wall cannot keep a throw going.
  world.allowSleep = true;
  const table = new CANNON.Material('table');
  const wallMaterial = new CANNON.Material('wall');
  const dieMaterial = new CANNON.Material('die');
  world.addContactMaterial(
    new CANNON.ContactMaterial(table, dieMaterial, { friction: 0.3, restitution: 0.42 }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(wallMaterial, dieMaterial, { friction: 0.05, restitution: 0.6 }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, dieMaterial, { friction: 0.2, restitution: 0.5 }),
  );
  const floor = new CANNON.Body({ mass: 0, material: table, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  for (const wall of walls) {
    const body = new CANNON.Body({ mass: 0, material: wallMaterial, shape: new CANNON.Plane() });
    body.position.set(wall.x, 0, wall.z);
    // A plane's normal is its local +z: turn it to the wall's inward normal.
    body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(wall.nx, 0, wall.nz));
    world.addBody(body);
  }

  const dx = start.towardX - start.x;
  const dz = start.towardZ - start.z;
  const distance = Math.hypot(dx, dz) || 1;
  const bodies = dice.map((spec, index) => {
    const body = new CANNON.Body({
      mass: 1,
      material: dieMaterial,
      shape: shapeOf(spec.kind, spec.size),
      linearDamping: 0.1,
      angularDamping: 0.16,
      allowSleep: true,
      sleepSpeedLimit: 0.3,
      sleepTimeLimit: 0.25,
    });
    const spread = (index - (dice.length - 1) / 2) * spec.size * 2.3;
    body.position.set(
      start.x - (dz / distance) * spread + (random() - 0.5),
      3 + random() * 2 + index * 0.4,
      start.z + (dx / distance) * spread + (random() - 0.5),
    );
    body.quaternion.setFromEuler(random() * 6.3, random() * 6.3, random() * 6.3);
    // Fast enough to tumble across a good part of the screen, slow enough to stop near its middle.
    const speed = Math.min(distance * 1.6, 13) * (0.85 + random() * 0.3);
    body.velocity.set((dx / distance) * speed, 1 + random() * 2, (dz / distance) * speed);
    body.angularVelocity.set((random() - 0.5) * 28, (random() - 0.5) * 28, (random() - 0.5) * 28);
    world.addBody(body);
    return body;
  });

  const hits: Hit[] = [];
  let now = 0;
  const lastHit = new Map<string, number>();
  for (const [index, body] of bodies.entries()) {
    body.addEventListener(
      'collide',
      (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        const speed = Math.abs(event.contact.getImpactVelocityAlongNormal());
        if (speed < 1.2) return;
        const other = bodies.indexOf(event.body);
        const key = `${String(Math.min(index, other))}:${String(Math.max(index, other))}`;
        if (now - (lastHit.get(key) ?? -1) < 0.045) return;
        lastHit.set(key, now);
        // A knock between two dice sounds once, from the lower index.
        if (other >= 0 && other < index) return;
        hits.push({ time: now, die: index, speed, x: body.position.x, withDie: other >= 0 });
      },
    );
  }

  const frames: Simulation['frames'][number][] = [];
  const record = () => {
    const positions = new Float32Array(bodies.length * 3);
    const rotations = new Float32Array(bodies.length * 4);
    for (const [index, body] of bodies.entries()) {
      positions.set([body.position.x, body.position.y, body.position.z], index * 3);
      rotations.set(
        [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
        index * 4,
      );
    }
    frames.push({ positions, rotations });
  };
  record();
  let resting = 0;
  for (let step = 1; now < MAX_SECONDS; step += 1) {
    world.step(STEP);
    now = step * STEP;
    if (step % FRAME_EVERY === 0) record();
    const still = bodies.every(
      (body) =>
        body.sleepState === CANNON.Body.SLEEPING ||
        (body.velocity.length() < REST_SPEED && body.angularVelocity.length() < REST_SPEED),
    );
    resting = still ? resting + STEP : 0;
    if (resting >= REST_FOR) break;
  }
  record();
  return {
    frameRate: 1 / (STEP * FRAME_EVERY),
    frames,
    hits,
    finalRotations: bodies.map((body): Quat => [
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    ]),
  };
}
