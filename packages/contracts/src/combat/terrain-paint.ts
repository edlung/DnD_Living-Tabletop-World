import type { Battlefield, BoardTrap, Square } from './battlefield.ts';
import type { TerrainPaint } from './board-commands.ts';

/**
 * The battlefield after a stroke of the DM's brush (docs/adr/0057-encounters-maps-loot.md §2), as
 * the decision checks it, the history replays it and the encounter builder paints before a fight.
 * A paint replaces what lay on its squares of its own kind; a wall replaces everything there,
 * anything else takes a wall away, and a clear leaves the squares bare (their light stays the
 * fight's). A trap's stroke lays one trap over its squares, taking them from any trap there (§6).
 * Each list comes out ordered by row, then column, so the same ground is always written the same
 * way.
 */
type At = { readonly x: number; readonly y: number };

const key = (square: At) => `${String(square.x)},${String(square.y)}`;
const byPlace = (a: At, b: At) => a.y - b.y || a.x - b.x;
const firstOf = (trap: BoardTrap): At => trap.squares[0] ?? { x: 0, y: 0 };

export function paintBattlefield(
  field: Battlefield,
  squares: readonly Square[],
  paint: TerrainPaint,
): Battlefield {
  const hit = new Set(squares.map(key));
  const laid = [...new Map(squares.map((square) => [key(square), { x: square.x, y: square.y }]))]
    .map(([, square]) => square)
    .sort(byPlace);
  const off = <T extends At>(list: readonly T[] | undefined): T[] =>
    (list ?? []).filter((square) => !hit.has(key(square)));
  const all = <T extends At>(kept: readonly T[], added: readonly T[] = []): T[] =>
    [...kept, ...added].sort(byPlace);
  const wall = paint.kind === 'wall';
  const clear = wall || paint.kind === 'clear';
  const walls = all(off(field.walls), wall ? laid : []);
  const difficult =
    paint.kind === 'difficult'
      ? all(off(field.difficult), laid)
      : clear
        ? all(off(field.difficult))
        : field.difficult;
  const cover =
    paint.kind === 'cover'
      ? all(
          off(field.cover),
          laid.map((square) => ({ ...square, level: paint.level })),
        )
      : clear
        ? all(off(field.cover))
        : field.cover;
  const water =
    paint.kind === 'water'
      ? all(
          off(field.water),
          laid.map((square) => (paint.deep ? { ...square, deep: true as const } : square)),
        )
      : clear
        ? all(off(field.water))
        : field.water;
  const ground =
    paint.kind === 'ground'
      ? all(
          off(field.ground),
          paint.ft === 0 ? [] : laid.map((square) => ({ ...square, ft: paint.ft })),
        )
      : clear
        ? all(off(field.ground))
        : field.ground;
  // One trap a stroke; a trap that loses all its squares is gone (§6).
  const trapsLeft = (field.traps ?? [])
    .map((trap) => ({ ...trap, squares: trap.squares.filter((square) => !hit.has(key(square))) }))
    .filter((trap) => trap.squares.length > 0);
  const traps: BoardTrap[] | undefined =
    paint.kind === 'trap'
      ? [
          ...trapsLeft,
          { trapId: paint.trapId, tier: paint.tier, squares: laid, hidden: paint.hidden },
        ].sort((a, b) => byPlace(firstOf(a), firstOf(b)))
      : clear
        ? trapsLeft
        : field.traps;
  const hazards =
    paint.kind === 'hazard'
      ? all(
          off(field.hazards),
          laid.map((square) => ({ ...square, hazard: paint.hazard })),
        )
      : clear
        ? all(off(field.hazards))
        : field.hazards;
  const obscured =
    paint.kind === 'obscured'
      ? all(
          off(field.obscured),
          laid.map((square) => (paint.heavy ? { ...square, heavy: true as const } : square)),
        )
      : clear
        ? all(off(field.obscured))
        : field.obscured;
  // The optional lists stay absent while empty, as a battlefield without them was written.
  const optional = <K extends 'walls' | 'water' | 'ground' | 'obscured' | 'traps' | 'hazards'>(
    name: K,
    list: Battlefield[K],
  ): Partial<Pick<Battlefield, K>> =>
    list && list.length > 0 ? ({ [name]: list } as Partial<Pick<Battlefield, K>>) : {};
  const rest: Battlefield = { ...field, difficult, cover };
  delete rest.walls;
  delete rest.water;
  delete rest.ground;
  delete rest.obscured;
  delete rest.traps;
  delete rest.hazards;
  return {
    ...rest,
    ...optional('walls', walls),
    ...optional('water', water),
    ...optional('ground', ground),
    ...optional('obscured', obscured),
    ...optional('traps', traps),
    ...optional('hazards', hazards),
  };
}

/** Whether two battlefields lay the same ground: the order of a list's squares and keys aside. */
export function sameGround(a: Battlefield, b: Battlefield): boolean {
  type Laid = At & { level?: string; deep?: true; ft?: number; heavy?: true };
  const lines = (list: readonly Laid[] | undefined) =>
    (list ?? [])
      .map((square) =>
        [
          key(square),
          square.level ?? '',
          square.deep ? 'deep' : '',
          square.ft ?? '',
          square.heavy ? 'heavy' : '',
        ].join(':'),
      )
      .sort()
      .join('|');
  const traps = (field: Battlefield) =>
    (field.traps ?? [])
      .map((trap) =>
        [
          trap.trapId,
          trap.tier,
          trap.hidden ? 'hidden' : '',
          trap.found ? 'found' : '',
          trap.disarmed ? 'disarmed' : '',
          trap.squares.map(key).sort().join(';'),
        ].join(':'),
      )
      .sort()
      .join('|');
  const hazards = (field: Battlefield) =>
    (field.hazards ?? [])
      .map(({ hazard, ...square }) =>
        [
          key(square),
          hazard.kind,
          `${String(hazard.dice.count)}d${String(hazard.dice.sides)}`,
          hazard.ability,
          hazard.dc,
          hazard.onSuccess,
        ].join(':'),
      )
      .sort()
      .join('|');
  const norm = (field: Battlefield) =>
    [
      ...[field.difficult, field.cover, field.walls, field.water, field.ground, field.obscured].map(
        (list) => lines(list),
      ),
      traps(field),
      hazards(field),
    ].join('/');
  return norm(a) === norm(b);
}

/** The battlefield with squares hidden in the fog of war, or revealed (ADR 0057 §4). */
export function fogBattlefield(
  field: Battlefield,
  squares: readonly Square[],
  hidden: boolean,
): Battlefield {
  const hit = new Set(squares.map(key));
  const kept = (field.fog ?? []).filter((square) => !hit.has(key(square)));
  const laid = hidden
    ? [...new Map(squares.map((square) => [key(square), { x: square.x, y: square.y }]))].map(
        ([, square]) => square,
      )
    : [];
  const fog = [...kept, ...laid].sort(byPlace);
  const rest: Battlefield = { ...field };
  delete rest.fog;
  return fog.length > 0 ? { ...rest, fog } : rest;
}
