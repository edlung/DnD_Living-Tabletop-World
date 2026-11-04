import { CREATURE_SIZES, type CreatureSize, type Square } from '@ltw/contracts';

/**
 * A combatant's space on the board as the projection gives it (docs/adr/0049-space-and-movement.md
 * §1, §4): squares across by size — a Large creature 2, Huge 3, Gargantuan 4 — from its north-west
 * square, one size smaller while it squeezes. The server decides every move; this only draws.
 */
const SPAN: Readonly<Record<CreatureSize, number>> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export interface Spaced {
  readonly position: Square;
  readonly size?: CreatureSize | undefined;
  readonly squeezed?: true | undefined;
}

/** Squares across its space as it stands now. */
export function spanOf(combatant: Spaced): number {
  const size = combatant.size ?? 'medium';
  const at = CREATURE_SIZES.indexOf(size);
  const now = combatant.squeezed ? (CREATURE_SIZES[Math.max(0, at - 1)] ?? size) : size;
  return SPAN[now];
}

/** Every square it fills, with its north-west square first. */
export function footprint(combatant: Spaced, at: Square = combatant.position): Square[] {
  const span = spanOf(combatant);
  const squares: Square[] = [];
  for (let dy = 0; dy < span; dy += 1)
    for (let dx = 0; dx < span; dx += 1) squares.push({ x: at.x + dx, y: at.y + dy });
  return squares;
}
