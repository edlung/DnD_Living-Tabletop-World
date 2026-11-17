import type { EncounterCombatantView } from '@ltw/contracts';

import { spanOf } from './footprint.ts';

type Facing = Pick<EncounterCombatantView, 'position' | 'side' | 'state' | 'size' | 'squeezed'> & {
  readonly entity: { readonly entityId: string };
};

/**
 * Which standing figures turn to their left (owner, 2026-11-17: the figures on the tilted board
 * looked anywhere but at each other). Every figure picture faces right (the campaign art and the
 * curated sets are drawn or mirrored so); a figure turns left — drawn mirrored — when the nearest
 * opponent still standing is to its left: the party faces the nearest hostile, a hostile the
 * nearest of the party. Nearest by squares between the centres of their spaces (the greater of
 * across and along, then across); a neutral, one with no opponent standing, or one with its
 * opponent straight ahead or behind keeps facing right. Decorative only: the squares' names and
 * the turn order say who is where.
 */
export function turnedLeft(combatants: readonly Facing[]): ReadonlySet<string> {
  const centre = (entry: Facing) => {
    const half = spanOf(entry) / 2;
    return { x: entry.position.x + half, y: entry.position.y + half };
  };
  const left = new Set<string>();
  for (const entry of combatants) {
    const against =
      entry.side === 'party' ? 'hostile' : entry.side === 'hostile' ? 'party' : undefined;
    if (!against) continue;
    const here = centre(entry);
    let nearest: { x: number; far: number; across: number } | null = null;
    for (const other of combatants) {
      if (other.side !== against || other.state === 'dead') continue;
      const there = centre(other);
      const across = Math.abs(there.x - here.x);
      const far = Math.max(across, Math.abs(there.y - here.y));
      if (nearest === null || far < nearest.far || (far === nearest.far && across > nearest.across))
        nearest = { x: there.x, far, across };
    }
    if (nearest && nearest.x < here.x) left.add(entry.entity.entityId);
  }
  return left;
}
