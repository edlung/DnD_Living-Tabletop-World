import type { TerrainPaint } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * A brush's name (docs/adr/0057-encounters-maps-loot.md §2), in the words the board's legend and
 * its terrain card already use, for the paint picker and the DM's history.
 */
const COVER = {
  half: 'Half cover',
  'three-quarters': 'Three-quarters cover',
  total: 'Total cover',
} as const;

export function paintName(t: Translate, paint: TerrainPaint): string {
  switch (paint.kind) {
    case 'wall':
      return t('Wall');
    case 'difficult':
      return t('Difficult terrain');
    case 'cover':
      return t(COVER[paint.level]);
    case 'water':
      return paint.deep ? t('Deep water') : t('Water');
    case 'ground':
      return paint.ft > 0
        ? t('Raised {feet} ft', { feet: paint.ft })
        : paint.ft < 0
          ? t('A pit {feet} ft deep', { feet: -paint.ft })
          : t('Level ground');
    case 'obscured':
      return paint.heavy ? t('Heavily obscured') : t('Lightly obscured');
    case 'clear':
      return t('Bare ground');
  }
}
