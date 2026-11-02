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
}: {
  readonly square: Square;
  readonly cover: CoverLevel | null;
  readonly difficult: boolean;
  /** A wall no one stands in or crosses (docs/adr/0049-space-and-movement.md §4). */
  readonly wall?: boolean;
}) {
  const t = useT();
  if (!cover && !difficult && !wall) return null;
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
    </div>
  );
}
