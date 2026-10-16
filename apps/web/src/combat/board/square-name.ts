import type { CoverLevel, EncounterCombatantView, Square } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/** A combatant's label: its name when this perspective knows it, else its ID as published. */
export const combatantLabel = (combatant: EncounterCombatantView): string =>
  combatant.entity.name ?? combatant.entity.entityId;

const COVER: Readonly<Record<CoverLevel, string>> = {
  half: 'half cover',
  'three-quarters': 'three-quarters cover',
  total: 'total cover',
};

/** What the projection says of one square; nothing here is inferred. */
export interface SquareFacts {
  readonly occupant: EncounterCombatantView | null;
  readonly you: boolean;
  readonly difficult: boolean;
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
    const parts = [
      facts.you ? t('{name} (you)', { name: combatantLabel(occupant) }) : combatantLabel(occupant),
      t(occupant.side),
      ...(occupant.state === 'up' ? [] : [t(occupant.state)]),
      ...occupant.conditions.map((condition) => t(condition)),
      ...(occupant.hitPoints ? [t('{current} / {max} HP', { ...occupant.hitPoints })] : []),
    ];
    notes.push(parts.join(', '));
  }
  if (facts.difficult) notes.push(t('difficult terrain'));
  if (facts.cover) notes.push(t(COVER[facts.cover]));
  if (occupant && facts.inArea) notes.push(t('in the area'));
  const name = t('Square {x}, {y}', { x: square.x, y: square.y });
  return notes.length > 0 ? `${name}: ${notes.join('; ')}` : name;
}
