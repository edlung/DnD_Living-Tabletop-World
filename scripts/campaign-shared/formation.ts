import type { CreatureSize, Square } from '../../packages/contracts/src/index.ts';
import { squaresOf } from '../../packages/rules/src/space.ts';
import type { Layout } from './combat-kit.ts';

type Side = Layout['partySide'];
/** Printed starts for the default state of the story; each array is in seating/foe order. */
export interface Formation {
  party?: readonly Square[];
  foes?: readonly Square[];
  boss?: Square;
}
function spawn(
  layout: Layout,
  side: Side,
  count: number,
  taken: Set<string>,
  size: CreatureSize = 'medium',
): Square[] {
  const { width, height } = layout;
  const blocked = new Set([...layout.difficult, ...layout.cover].map((c) => `${c.x},${c.y}`));
  const horizontal = side === 'W' || side === 'E';
  const across = horizontal ? height : width;
  const span = horizontal ? width : height;
  const order = Array.from({ length: across }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (across - 1) / 2) - Math.abs(b - (across - 1) / 2),
  );
  const found: Square[] = [];
  for (let depth = 0; depth < span && found.length < count; depth++) {
    const along = side === 'W' || side === 'N' ? depth : span - 1 - depth;
    for (const s of order) {
      if (found.length === count) break;
      const square = horizontal ? { x: along, y: s } : { x: s, y: along };
      const tiles = squaresOf({ position: square, size });
      if (
        tiles.some(
          ({ x, y }) =>
            x >= width || y >= height || blocked.has(`${x},${y}`) || taken.has(`${x},${y}`),
        )
      )
        continue;
      for (const tile of tiles) taken.add(`${tile.x},${tile.y}`);
      found.push(square);
    }
  }
  if (found.length < count) throw new Error('Battlefield too small for its combatants');
  return found;
}

export function placeFormation(
  layout: Layout,
  partySize: number,
  foeCount: number,
  fixed?: Formation,
  bossSize?: CreatureSize,
) {
  const reserved = new Set<string>();
  const placed = (
    points: readonly Square[] | undefined,
    count: number,
    size: CreatureSize = 'medium',
  ): Square[] => {
    const selected = (points ?? []).slice(0, count);
    for (const position of selected)
      for (const p of squaresOf({ position, size })) {
        const key = `${String(p.x)},${String(p.y)}`;
        if (reserved.has(key) || p.x < 0 || p.y < 0 || p.x >= layout.width || p.y >= layout.height)
          throw new Error('Invalid authored starting square ' + key);
        reserved.add(key);
      }
    return selected;
  };
  const heroes = placed(fixed?.party, partySize);
  const separateBoss = Boolean(fixed?.boss || bossSize);
  const regularCount = separateBoss ? foeCount - 1 : foeCount;
  const foes = placed(fixed?.foes, regularCount);
  const boss = placed(fixed?.boss ? [fixed.boss] : [], 1, bossSize);
  heroes.push(...spawn(layout, layout.partySide, partySize - heroes.length, reserved));
  foes.push(...spawn(layout, layout.foeSide, regularCount - foes.length, reserved));
  if (separateBoss)
    foes.push(...(boss.length ? boss : spawn(layout, layout.foeSide, 1, reserved, bossSize)));
  return { heroes, foes };
}
