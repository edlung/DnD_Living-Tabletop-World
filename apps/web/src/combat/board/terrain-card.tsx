import type { CoverLevel, Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { Glyph } from '../../visual/glyph.tsx';

const COVER: Readonly<Record<CoverLevel, string>> = {
  half: 'Half cover',
  'three-quarters': 'Three-quarters cover',
  total: 'Total cover',
};

/**
 * The terrain of the square the viewer points at, focuses or chose (design §5.5, like the
 * concepts' terrain card): its cover level, difficult ground and walls, exactly as the projection
 * lists them. Shown only when the square has any. It repeats what the square's own name
 * already says, so it is not announced again.
 */
export function TerrainCard({
  square,
  cover,
  difficult,
  wall = false,
  water = null,
  groundFt = 0,
}: {
  readonly square: Square;
  readonly cover: CoverLevel | null;
  readonly difficult: boolean;
  /** A wall no one stands in or crosses (docs/adr/0049-space-and-movement.md §4). */
  readonly wall?: boolean;
  /** Water, swum; deep water immerses (§5, §11). */
  readonly water?: 'shallow' | 'deep' | null;
  /** The ground raised, or a pit (§6). */
  readonly groundFt?: number;
}) {
  const t = useT();
  if (!cover && !difficult && !wall && water === null && groundFt === 0) return null;
  return (
    <div className="terrain-card" aria-hidden="true">
      <p className="terrain-square">{t('Square {x}, {y}', { x: square.x, y: square.y })}</p>
      {cover && (
        <p>
          <Glyph name="cover" />
          {t(COVER[cover])}
        </p>
      )}
      {difficult && (
        <p>
          <Glyph name="difficult" />
          {t('Difficult terrain')}
        </p>
      )}
      {wall && (
        <p>
          <Glyph name="cover" />
          {t('Wall: no one stands in it or crosses it')}
        </p>
      )}
      {water && (
        <p>
          <Glyph name="move" />
          {water === 'deep'
            ? t('Deep water: swum, and fought in under water')
            : t('Water: swum, at double cost without a Swim Speed')}
        </p>
      )}
      {groundFt !== 0 && (
        <p>
          <Glyph name="move" />
          {groundFt > 0
            ? t('Raised {feet} ft: climbed from below', { feet: groundFt })
            : t('A pit {feet} ft deep: climbed down, dropped into or jumped', {
                feet: -groundFt,
              })}
        </p>
      )}
    </div>
  );
}
