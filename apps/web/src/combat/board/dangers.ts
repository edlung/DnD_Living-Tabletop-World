import type { Battlefield, BoardHazard, BoardTrap } from '@ltw/contracts';

/**
 * Traps and harmful ground on the board (docs/adr/0057-encounters-maps-loot.md §6), as the
 * viewer's projection carries them — a hidden trap only on the DM's — by square. Harmful ground is
 * a tint under the figures in its kind's colour; a trap is a warning mark in its square's corner,
 * dashed while hidden from the players, dim once spent or disarmed. The square's name says what
 * each is (`square-name.ts`).
 */
export interface Dangers {
  readonly traps: ReadonlyMap<string, BoardTrap>;
  readonly hazards: ReadonlyMap<string, BoardHazard>;
}

const key = (square: { readonly x: number; readonly y: number }) =>
  `${String(square.x)},${String(square.y)}`;

export function dangersOf(field: Pick<Battlefield, 'traps' | 'hazards'>): Dangers {
  const traps = new Map<string, BoardTrap>();
  for (const trap of field.traps ?? [])
    for (const square of trap.squares) traps.set(key(square), trap);
  const hazards = new Map((field.hazards ?? []).map((square) => [key(square), square.hazard]));
  return { traps, hazards };
}

/** A trap as the board and its words tell it: hidden from the table, set in sight, sprung, disarmed. */
export type TrapState = 'hidden' | 'set' | 'sprung' | 'disarmed';
export const trapState = (trap: BoardTrap): TrapState =>
  trap.disarmed === true
    ? 'disarmed'
    : (trap.springs ?? 0) > 0
      ? 'sprung'
      : trap.hidden && trap.found !== true
        ? 'hidden'
        : 'set';
