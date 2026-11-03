import type { TerrainPaint } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { TRAP_WORDS } from '../rules/toolbox-words.ts';

/**
 * A brush's name (docs/adr/0057-encounters-maps-loot.md §2), in the words the board's legend and
 * its terrain card already use, for the paint picker and the DM's history.
 */
const COVER = {
  half: 'Half cover',
  'three-quarters': 'Three-quarters cover',
  total: 'Total cover',
} as const;
/** Harmful ground (ADR 0057 §6). */
export const HAZARD_WORDS = {
  fire: 'Fire on the ground',
  acid: 'Acid on the ground',
  poison: 'A poison cloud',
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
    case 'trap':
      return t('Trap: {name}', { name: t(TRAP_WORDS[paint.trapId]) });
    case 'hazard':
      return t(HAZARD_WORDS[paint.hazard.kind]);
    case 'clear':
      return t('Bare ground');
  }
}
