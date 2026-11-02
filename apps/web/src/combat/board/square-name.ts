import type { CoverLevel, EncounterCombatantView, LightLevel, Square } from '@ltw/contracts';
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
  /** Who rides the occupant (docs/adr/0049-space-and-movement.md §10); absent or null: none. */
  readonly rider?: {
    readonly view: EncounterCombatantView;
    readonly label: string;
    readonly you: boolean;
  } | null;
  readonly difficult: boolean;
  /** A wall (docs/adr/0049-space-and-movement.md §4); absent: none. */
  readonly wall?: boolean;
  /** Water, shallow or deep (§5, §11); absent or null: none. */
  readonly water?: 'shallow' | 'deep' | null;
  /** The ground's height in feet: raised, or a pit below 0 (§6); absent: 0. */
  readonly groundFt?: number;
  /** Its light and its fog (docs/adr/0050-the-world-around.md §1); absent: bright and clear. */
  readonly light?: LightLevel;
  readonly obscured?: 'none' | 'light' | 'heavy';
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
      // Flying above its ground, or burrowed below it (ADR 0049 §6, §9).
      ...((occupant.altitudeFt ?? 0) > 0
        ? [t('{feet} ft up', { feet: occupant.altitudeFt ?? 0 })]
        : (occupant.altitudeFt ?? 0) < 0
          ? [t('underground')]
          : []),
      ...(occupant.state === 'up' ? [] : [thing ? t('destroyed') : t(occupant.state)]),
      ...occupant.conditions.map((condition) => t(condition)),
      ...(occupant.hitPoints ? [t('{current} / {max} HP', { ...occupant.hitPoints })] : []),
    ];
    notes.push(parts.join(', '));
  }
  const { rider } = facts;
  if (rider) {
    const name = rider.you ? t('{name} (you)', { name: rider.label }) : rider.label;
    notes.push(
      [
        t('ridden by {name}', { name }),
        t(rider.view.side),
        ...(rider.view.state === 'up' ? [] : [t(rider.view.state)]),
        ...rider.view.conditions.map((condition) => t(condition)),
        ...(rider.view.hitPoints ? [t('{current} / {max} HP', { ...rider.view.hitPoints })] : []),
      ].join(', '),
    );
  }
  if (facts.wall === true) notes.push(t('wall'));
  if (facts.water === 'deep') notes.push(t('deep water'));
  if (facts.water === 'shallow') notes.push(t('water'));
  const ground = facts.groundFt ?? 0;
  if (ground > 0) notes.push(t('raised {feet} ft', { feet: ground }));
  if (ground < 0) notes.push(t('a pit {feet} ft deep', { feet: -ground }));
  if (facts.light === 'dim') notes.push(t('dim light'));
  if (facts.light === 'dark') notes.push(t('darkness'));
  if (facts.obscured === 'light') notes.push(t('lightly obscured'));
  if (facts.obscured === 'heavy') notes.push(t('heavily obscured'));
  if (facts.difficult) notes.push(t('difficult terrain'));
  if (facts.cover) notes.push(t(COVER[facts.cover]));
  if (occupant && facts.inArea) notes.push(t('in the area'));
  const name = t('Square {x}, {y}', { x: square.x, y: square.y });
  return notes.length > 0 ? `${name}: ${notes.join('; ')}` : name;
}
