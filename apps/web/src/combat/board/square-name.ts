import type { CoverLevel, EncounterCombatantView, Square } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

const COVER: Readonly<Record<CoverLevel, string>> = {
  half: 'half cover',
  'three-quarters': 'three-quarters cover',
  total: 'total cover',
};

/** What the projection says of one square; nothing here is inferred. */
export interface SquareFacts {
  readonly occupant: EncounterCombatantView | null;
  /** The occupant's label (`combat/labels.ts`): its name, or "Unidentified creature N". */
  readonly label: string;
  readonly you: boolean;
  readonly difficult: boolean;
  /** A wall (docs/adr/0049-space-and-movement.md §4); absent: none. */
  readonly wall?: boolean;
  readonly cover: CoverLevel | null;
  /** The occupant is among those a previewed area spell would affect (the server's list). */
  readonly inArea: boolean;
}

/**
 * The accessible name of a board square, the same whether the board lies flat or tilted:
 * its coordinates, then who stands there (with side, state, conditions and hit points as the
 * projection carries them), its terrain and cover, and whether a previewed area includes it.
 */
export function squareName(t: Translate, square: Square, facts: SquareFacts): string {
  const { occupant } = facts;
  const notes: string[] = [];
  if (occupant) {
    // An object has no side, and is destroyed rather than dead (docs/adr/0048-hit-points.md §5).
    const thing = occupant.object !== undefined;
    const parts = [
      facts.you ? t('{name} (you)', { name: facts.label }) : facts.label,
      thing ? t('object') : t(occupant.side),
      // Its size when not Medium, and a squeeze (ADR 0049 §1, §4).
      ...(occupant.size === undefined ? [] : [t(occupant.size)]),
      ...(occupant.squeezed ? [t('squeezed')] : []),
      ...(occupant.state === 'up' ? [] : [thing ? t('destroyed') : t(occupant.state)]),
      ...occupant.conditions.map((condition) => t(condition)),
      ...(occupant.hitPoints ? [t('{current} / {max} HP', { ...occupant.hitPoints })] : []),
    ];
    notes.push(parts.join(', '));
  }
  if (facts.wall === true) notes.push(t('wall'));
  if (facts.difficult) notes.push(t('difficult terrain'));
  if (facts.cover) notes.push(t(COVER[facts.cover]));
  if (occupant && facts.inArea) notes.push(t('in the area'));
  const name = t('Square {x}, {y}', { x: square.x, y: square.y });
  return notes.length > 0 ? `${name}: ${notes.join('; ')}` : name;
}
