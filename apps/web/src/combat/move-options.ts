import type { EncounterView, PathStep, Square } from '@ltw/contracts';

import { footprint } from './board/footprint.ts';
import { groundUnder, planPath } from './movement.ts';

/**
 * The ways the turn tray offers to move (docs/adr/0049-space-and-movement.md §5–8): to the chosen
 * square on foot or through the air at the mover's height, landing there from the air, crawling
 * there while Prone, a jump along a straight line over a pit, water or rough ground, a drop off a
 * ledge or into a pit beside it; and for a flyer, rising or coming down where it is. A rider only
 * gets down beside its mount (§10). Each is a path the World Engine judges with its advisory cost:
 * the rules decide, never this list.
 */
export type MoveKind =
  'move' | 'land' | 'crawl' | 'jump' | 'drop' | 'rise' | 'descend' | 'dismount';

export interface MoveOption {
  readonly kind: MoveKind;
  readonly path: readonly PathStep[];
  /** Advisory feet of movement it costs; the rules confirm it. */
  readonly costFt: number;
  /** Crawling: it stays Prone (§5). */
  readonly crawl?: true;
  /** A drop's fall, in feet (§8). */
  readonly fallFt?: number;
}

const SQUARE_FT = 5;
/** A flyer rises or comes down 10 ft at a time. */
const FLIGHT_STEP_FT = 10;
/** The longest jump a tray offers: a Strength of 30 after a run-up (§7). */
const JUMP_SQUARES = 6;
const MAX_ALTITUDE_FT = 500;

const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y;
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;

/**
 * The combatant whose space holds the square, if any: a rider on the square it sits on (§10), a
 * flyer before the one below.
 */
export const occupantAt = (encounter: Pick<EncounterView, 'combatants'>, square: Square) =>
  encounter.combatants.find((entry) => entry.mountedOn && same(entry.position, square)) ??
  [...encounter.combatants]
    .sort((a, b) => (b.altitudeFt ?? 0) - (a.altitudeFt ?? 0))
    .find((entry) => footprint(entry).some((at) => same(at, square))) ??
  null;

/** The ways to the chosen square. */
export function squareMoves(
  encounter: EncounterView,
  moverId: string,
  square: Square,
): MoveOption[] {
  const mover = encounter.combatants.find((entry) => entry.entity.entityId === moverId);
  if (!mover || same(square, mover.position)) return [];
  if (mover.mountedOn) return dismountAt(encounter, mover.mountedOn.entityId, square);
  const altitude = mover.altitudeFt ?? 0;
  const prone = mover.conditions.includes('prone');
  const options: MoveOption[] = [];
  const plan = planPath(encounter, moverId, square);
  if (plan) options.push({ kind: 'move', path: plan.path, costFt: plan.costFt });
  // From the air down to the ground there, 5 ft a step (§6).
  const high = plan?.path.at(-1)?.altitudeFt ?? 0;
  if (plan && high > 0) {
    const down: PathStep[] = [];
    for (let feet = high - SQUARE_FT; feet >= 0; feet -= SQUARE_FT)
      down.push(feet === 0 ? { ...square } : { ...square, altitudeFt: feet });
    options.push({ kind: 'land', path: [...plan.path, ...down], costFt: plan.costFt + high });
  }
  if (altitude !== 0) return options;
  if (prone) {
    const crawl = planPath(encounter, moverId, square, true);
    if (crawl) options.push({ kind: 'crawl', path: crawl.path, costFt: crawl.costFt, crawl: true });
  }
  const { battlefield } = encounter;
  const walls = new Set((battlefield.walls ?? []).map(key));
  const taken = new Set(
    encounter.combatants
      .filter((other) => other.entity.entityId !== moverId && other.state !== 'dead')
      .flatMap((other) => footprint(other).map(key)),
  );
  /** Its whole space at `at` lies on the field, off the walls, clear of everyone. */
  const free = (at: Square) =>
    footprint(mover, at).every(
      (s) =>
        s.x >= 0 &&
        s.y >= 0 &&
        s.x < battlefield.width &&
        s.y < battlefield.height &&
        !walls.has(key(s)) &&
        !taken.has(key(s)),
    );
  const from = groundUnder(encounter, footprint(mover));
  const to = groundUnder(encounter, footprint(mover, square));
  const dx = square.x - mover.position.x;
  const dy = square.y - mover.position.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  // A drop beside it, onto ground more than 5 ft below its own: a fall (§8).
  if (reach === 1 && from - to > SQUARE_FT && free(square)) {
    options.push({
      kind: 'drop',
      path: [{ ...square, drop: true }],
      costFt: SQUARE_FT,
      fallFt: from - to,
    });
  }
  // A jump along a straight line over what walking would not cross as well: a pit, water, rough
  // ground, or no route at all (§7). Its squares must be clear; the rules weigh its length.
  const straight = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  if (straight && reach >= 2 && reach <= JUMP_SQUARES) {
    const line: Square[] = [];
    for (let step = 1; step <= reach; step += 1)
      line.push({
        x: mover.position.x + Math.sign(dx) * step,
        y: mover.position.y + Math.sign(dy) * step,
      });
    const wet = new Set((battlefield.water ?? []).map(key));
    const hard = new Set(battlefield.difficult.map(key));
    const over = line
      .slice(0, -1)
      .some((at) =>
        footprint(mover, at).some(
          (s) =>
            wet.has(key(s)) || hard.has(key(s)) || from - groundUnder(encounter, [s]) > SQUARE_FT,
        ),
      );
    if (line.every(free) && (over || !plan)) {
      options.push({
        kind: 'jump',
        path: line.map((at) => ({ ...at, jump: true as const })),
        costFt: reach * SQUARE_FT + Math.max(0, to - from),
      });
    }
  }
  return options;
}

/** A rider gets down on a free square beside its mount's space, for half its Speed (§10). */
function dismountAt(encounter: EncounterView, mountId: string, square: Square): MoveOption[] {
  const mount = encounter.combatants.find((entry) => entry.entity.entityId === mountId);
  if (!mount) return [];
  const space = footprint(mount);
  const beside =
    !space.some((at) => same(at, square)) &&
    space.some((at) => Math.max(Math.abs(at.x - square.x), Math.abs(at.y - square.y)) === 1);
  const { battlefield } = encounter;
  const free =
    square.x >= 0 &&
    square.y >= 0 &&
    square.x < battlefield.width &&
    square.y < battlefield.height &&
    !(battlefield.walls ?? []).some((at) => same(at, square)) &&
    !encounter.combatants.some(
      (other) =>
        other.state !== 'dead' &&
        other.mountedOn === undefined &&
        footprint(other).some((at) => same(at, square)),
    );
  return beside && free ? [{ kind: 'dismount', path: [{ ...square }], costFt: 0 }] : [];
}

/** A flyer's rising and coming down where it is (§6); a rider rides, it does not fly. */
export function flightMoves(encounter: EncounterView, moverId: string): MoveOption[] {
  const mover = encounter.combatants.find((entry) => entry.entity.entityId === moverId);
  if (!mover?.flies || mover.mountedOn) return [];
  const at = mover.position;
  const altitude = mover.altitudeFt ?? 0;
  const options: MoveOption[] = [];
  if (altitude + FLIGHT_STEP_FT <= MAX_ALTITUDE_FT) {
    options.push({
      kind: 'rise',
      path: [
        { ...at, altitudeFt: altitude + SQUARE_FT },
        { ...at, altitudeFt: altitude + FLIGHT_STEP_FT },
      ],
      costFt: FLIGHT_STEP_FT,
    });
  }
  if (altitude > 0) {
    const path: PathStep[] = [];
    for (
      let feet = altitude - SQUARE_FT;
      feet >= Math.max(0, altitude - FLIGHT_STEP_FT);
      feet -= SQUARE_FT
    )
      path.push(feet === 0 ? { ...at } : { ...at, altitudeFt: feet });
    options.push({ kind: 'descend', path, costFt: altitude - (path.at(-1)?.altitudeFt ?? 0) });
  }
  return options;
}
