import type { Battlefield, Square } from './battlefield.ts';
import type { TerrainPaint } from './board-commands.ts';

/**
 * The battlefield after a stroke of the DM's brush (docs/adr/0057-encounters-maps-loot.md §2), as
 * the decision checks it, the history replays it and the encounter builder paints before a fight. A paint replaces what lay on its squares of
 * its own kind; a wall replaces everything there, anything else takes a wall away, and a clear
 * leaves the squares bare (their light stays the fight's). Each list comes out ordered by row, then
 * column, so the same ground is always written the same way.
 */
type At = { readonly x: number; readonly y: number };

const key = (square: At) => `${String(square.x)},${String(square.y)}`;
const byPlace = (a: At, b: At) => a.y - b.y || a.x - b.x;

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
  const optional = <K extends 'walls' | 'water' | 'ground' | 'obscured'>(
    name: K,
    list: Battlefield[K],
  ): Partial<Pick<Battlefield, K>> =>
    list && list.length > 0 ? ({ [name]: list } as Partial<Pick<Battlefield, K>>) : {};
  const rest: Battlefield = { ...field, difficult, cover };
  delete rest.walls;
  delete rest.water;
  delete rest.ground;
  delete rest.obscured;
  return {
    ...rest,
    ...optional('walls', walls),
    ...optional('water', water),
    ...optional('ground', ground),
    ...optional('obscured', obscured),
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
  const norm = (field: Battlefield) =>
    [field.difficult, field.cover, field.walls, field.water, field.ground, field.obscured]
      .map((list) => lines(list))
      .join('/');
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
