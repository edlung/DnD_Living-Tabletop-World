import type { DieSides } from '@ltw/contracts';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { d10Label, landOn, percentile, topSlot, type Quat } from './landing.ts';
import { d4FaceTextures, faceTextures, type FaceArt } from './labels.ts';
import { dieMesh, type DieMesh } from './mesh.ts';
import { simulate, type Hit, type Wall } from './simulate.ts';
import { solidOf, type DieKind } from './solids.ts';

/**
 * The 3D dice (Stage 510): three.js over a transparent canvas laid across the screen. A throw is
 * simulated first (`simulate.ts`), each die's labels are then set so the face it lands on shows the
 * server's value (`landing.ts`), and the recorded path plays with smooth interpolation. Dice cast
 * soft shadows onto the interface beneath them.
 */
/** The players' obsidian dice, or the DM's ivory ones. */
export type DiceSet = 'obsidian' | 'ivory';

export interface DieRequest {
  readonly sides: DieSides;
  readonly value: number;
  /** Rolled but not counted (Advantage, Disadvantage): drawn dimmed once at rest. */
  readonly dropped?: boolean;
}

/** Where thrown dice came to rest on the screen: their centre and the box around them. */
export interface Landing {
  readonly x: number;
  readonly y: number;
  readonly top: number;
  readonly bottom: number;
}

export interface Throw {
  /** Every bounce, for the sound, in seconds from the start. */
  readonly hits: readonly (Hit & { readonly pan: number })[];
  readonly duration: number;
  /** Settles when the dice are at rest: where they lie on the screen (CSS pixels). */
  readonly landed: Promise<Landing>;
}

const KIND: Readonly<Record<Exclude<DieSides, 100>, DieKind>> = {
  4: 'd4',
  6: 'd6',
  8: 'd8',
  10: 'd10',
  12: 'd12',
  20: 'd20',
};

interface Physical {
  readonly kind: DieKind;
  /** What the die must show, as its labels read (a d10 0–9). */
  readonly label: number;
  /** A percentile tens die shows "00"–"90". */
  readonly tens: boolean;
  readonly dropped: boolean;
}

function physicalDice(requests: readonly DieRequest[]): Physical[] {
  return requests.flatMap((request): Physical[] => {
    const dropped = request.dropped ?? false;
    if (request.sides === 100) {
      const { tens, units } = percentile(request.value);
      return [
        { kind: 'd10', label: tens, tens: true, dropped },
        { kind: 'd10', label: units, tens: false, dropped },
      ];
    }
    const kind = KIND[request.sides];
    return [
      {
        kind,
        label: kind === 'd10' ? d10Label(request.value) : request.value,
        tens: false,
        dropped,
      },
    ];
  });
}

export class DiceEngine {
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(32, 1, 1, 200);
  readonly #gold = new THREE.MeshStandardMaterial({
    color: '#c9a45c',
    metalness: 1,
    roughness: 0.28,
  });
  readonly #meshes = new Map<string, DieMesh>();
  readonly #materials = new Map<string, THREE.MeshStandardMaterial>();
  readonly #arts: Readonly<Record<DiceSet, FaceArt>>;
  readonly #light: THREE.DirectionalLight;
  #dice: THREE.Mesh[] = [];
  #frame = 0;

  constructor(canvas: HTMLCanvasElement, arts: Readonly<Record<DiceSet, FaceArt>>) {
    this.#canvas = canvas;
    this.#arts = arts;
    this.#renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFShadowMap;
    const environment = new THREE.PMREMGenerator(this.#renderer);
    this.#scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    // Reflections for the gold; the stone faces take little of them.
    this.#scene.environmentIntensity = 0.75;
    environment.dispose();
    this.#scene.add(new THREE.HemisphereLight('#9fd6e6', '#2a1c0c', 0.5));
    this.#light = new THREE.DirectionalLight('#ffd8a0', 2.6);
    this.#light.position.set(-8, 24, 10);
    this.#light.castShadow = true;
    this.#light.shadow.mapSize.set(2048, 2048);
    this.#light.shadow.radius = 6;
    this.#light.shadow.bias = -0.0004;
    this.#scene.add(this.#light, this.#light.target);
    const rim = new THREE.DirectionalLight('#46c0dc', 0.9);
    rim.position.set(10, 6, -12);
    this.#scene.add(rim);
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ color: '#05090e', opacity: 0.42 }),
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    this.#scene.add(catcher);
    this.#camera.position.set(0, 30, 13);
    this.#camera.lookAt(0, 0, 0);
    this.resize();
  }

  /** Fits the canvas and the camera to the screen. */
  resize(): void {
    const width = this.#canvas.clientWidth || window.innerWidth;
    const height = this.#canvas.clientHeight || window.innerHeight;
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  /** Where screen points (NDC) meet the table. */
  #onTable(x: number, y: number): THREE.Vector3 {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.#camera);
    const point = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point);
    return point;
  }

  /** The table inside the screen's edges: corners and inward walls. */
  #table() {
    // The middle of the screen: clear of the top bar above and the dock below.
    const across = 0.82;
    const corners = [
      this.#onTable(-across, -0.62),
      this.#onTable(across, -0.62),
      this.#onTable(across, 0.66),
      this.#onTable(-across, 0.66),
    ];
    const center = corners
      .reduce((sum, corner) => sum.add(corner), new THREE.Vector3())
      .divideScalar(4);
    const walls: Wall[] = corners.map((corner, index) => {
      const next = corners[(index + 1) % corners.length] ?? corner;
      let nx = -(next.z - corner.z);
      let nz = next.x - corner.x;
      const norm = Math.hypot(nx, nz) || 1;
      nx /= norm;
      nz /= norm;
      if ((center.x - corner.x) * nx + (center.z - corner.z) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { x: corner.x, z: corner.z, nx, nz };
    });
    const [nearLeft, nearRight, , farLeft] = corners;
    const span = Math.min(
      (nearRight?.x ?? 1) - (nearLeft?.x ?? 0),
      (nearLeft?.z ?? 1) - (farLeft?.z ?? 0),
    );
    return { corners, walls, center, span };
  }

  #mesh(kind: DieKind, size: number): DieMesh {
    const key = `${kind}:${size.toFixed(2)}`;
    const known = this.#meshes.get(key);
    if (known) return known;
    const built = dieMesh(solidOf(kind), size);
    this.#meshes.set(key, built);
    return built;
  }

  #faceMaterial(key: string, make: () => { map: THREE.Texture; emissiveMap: THREE.Texture }) {
    const known = this.#materials.get(key);
    if (known) return known;
    const { map, emissiveMap } = make();
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color('#8a6a33'),
      emissiveIntensity: 0.6,
      roughness: 0.48,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    this.#materials.set(key, material);
    return material;
  }

  /** The materials of a die whose label slots read `labels`, gold last. */
  #materialsFor(
    physical: Physical,
    labels: readonly number[],
    mesh: DieMesh,
    set: DiceSet,
  ): THREE.Material[] {
    const solid = solidOf(physical.kind);
    const art = this.#arts[set];
    const faces = solid.faces.map((face, index) => {
      if (solid.vertexLabels) {
        const corners = face.map(
          (vertex, corner) =>
            [
              mesh.cornerUvs[index]?.[corner]?.[0] ?? 0.5,
              mesh.cornerUvs[index]?.[corner]?.[1] ?? 0.5,
              labels[vertex] ?? 0,
            ] as const,
        );
        const key = `${set}:d4:${String(index)}:${corners.map((corner) => corner[2]).join('-')}`;
        return this.#faceMaterial(key, () => d4FaceTextures(corners, art));
      }
      const label = labels[index] ?? 0;
      const text = physical.tens ? `${String(label)}0`.padStart(2, '0') : String(label);
      return this.#faceMaterial(`${set}:${physical.kind}:${text}`, () =>
        faceTextures(physical.kind, text, art),
      );
    });
    const all: THREE.Material[] = [...faces, this.#gold];
    if (!physical.dropped) return all;
    // A die rolled but not counted rests dimmed.
    return all.map((material) => {
      const dim = (material as THREE.MeshStandardMaterial).clone();
      dim.color.multiplyScalar(0.35);
      dim.emissiveIntensity = 0.1;
      return dim;
    });
  }

  /** Throws dice that land on their values; resolves `landed` when they rest. */
  throw(requests: readonly DieRequest[], set: DiceSet): Throw {
    this.clear();
    this.resize();
    const dice = physicalDice(requests);
    const { corners, walls, center, span } = this.#table();
    const size = Math.max(0.8, Math.min(1.8, span * 0.07));
    const from = corners[1] ?? center;
    const simulation = simulate(
      dice.map((die) => ({ kind: die.kind, size })),
      walls,
      {
        x: center.x + (from.x - center.x) * 0.75,
        z: center.z + (from.z - center.z) * 0.75,
        towardX: center.x - span * 0.12,
        towardZ: center.z + span * 0.05,
      },
      Math.random,
    );
    this.#dice = dice.map((physical, index) => {
      const solid = solidOf(physical.kind);
      const rest = simulation.finalRotations[index] ?? ([0, 0, 0, 1] as Quat);
      const labels = landOn(solid.labels, topSlot(solid, rest), physical.label);
      const mesh = this.#mesh(physical.kind, size);
      const die = new THREE.Mesh(mesh.geometry, this.#materialsFor(physical, labels, mesh, set));
      die.castShadow = true;
      this.#scene.add(die);
      return die;
    });
    const duration = (simulation.frames.length - 1) / simulation.frameRate;
    const width = Math.max(1, (corners[1]?.x ?? 1) - (corners[0]?.x ?? 0));
    const hits = simulation.hits.map((hit) => ({
      ...hit,
      pan: Math.max(-1, Math.min(1, ((hit.x - center.x) / width) * 2)),
    }));
    const landed = new Promise<Landing>((resolve) => {
      const started = performance.now();
      const pose = (frame: number, die: THREE.Mesh, index: number, mix: number) => {
        const a = simulation.frames[frame];
        const b = simulation.frames[Math.min(frame + 1, simulation.frames.length - 1)];
        if (!a || !b) return;
        const p = index * 3;
        const r = index * 4;
        die.position.set(
          (a.positions[p] ?? 0) + ((b.positions[p] ?? 0) - (a.positions[p] ?? 0)) * mix,
          (a.positions[p + 1] ?? 0) + ((b.positions[p + 1] ?? 0) - (a.positions[p + 1] ?? 0)) * mix,
          (a.positions[p + 2] ?? 0) + ((b.positions[p + 2] ?? 0) - (a.positions[p + 2] ?? 0)) * mix,
        );
        const qa = new THREE.Quaternion(
          a.rotations[r],
          a.rotations[r + 1],
          a.rotations[r + 2],
          a.rotations[r + 3],
        );
        const qb = new THREE.Quaternion(
          b.rotations[r],
          b.rotations[r + 1],
          b.rotations[r + 2],
          b.rotations[r + 3],
        );
        die.quaternion.copy(qa.slerp(qb, mix));
      };
      const tick = () => {
        const elapsed = (performance.now() - started) / 1000;
        const exact = Math.min(elapsed * simulation.frameRate, simulation.frames.length - 1);
        const frame = Math.floor(exact);
        for (const [index, die] of this.#dice.entries()) pose(frame, die, index, exact - frame);
        this.#renderer.render(this.#scene, this.#camera);
        if (elapsed < duration) {
          this.#frame = requestAnimationFrame(tick);
          return;
        }
        const rect = this.#canvas.getBoundingClientRect();
        const toScreen = (point: THREE.Vector3) => {
          const projected = point.clone().project(this.#camera);
          return {
            x: rect.left + ((projected.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - projected.y) / 2) * rect.height,
          };
        };
        const reach = new THREE.Vector3(0, 0, size);
        const points = this.#dice.flatMap((die) => [
          toScreen(die.position.clone().sub(reach)),
          toScreen(die.position.clone().add(reach)),
        ]);
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        resolve({
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: (Math.min(...ys) + Math.max(...ys)) / 2,
          top: Math.min(...ys),
          bottom: Math.max(...ys),
        });
      };
      this.#frame = requestAnimationFrame(tick);
    });
    return { hits, duration, landed };
  }

  /** Takes the dice away (the overlay fades them first). */
  clear(): void {
    cancelAnimationFrame(this.#frame);
    for (const die of this.#dice) {
      this.#scene.remove(die);
      // Dimmed clones belong to their die; shared label materials and the gold stay.
      for (const material of die.material as THREE.Material[]) {
        if (material !== this.#gold && !this.#shared(material)) material.dispose();
      }
    }
    this.#dice = [];
    this.#renderer.render(this.#scene, this.#camera);
  }

  #shared(material: THREE.Material): boolean {
    for (const known of this.#materials.values()) if (known === material) return true;
    return false;
  }

  dispose(): void {
    this.clear();
    for (const material of this.#materials.values()) {
      material.map?.dispose();
      material.emissiveMap?.dispose();
      material.dispose();
    }
    for (const mesh of this.#meshes.values()) mesh.geometry.dispose();
    this.#gold.dispose();
    this.#renderer.dispose();
  }
}
