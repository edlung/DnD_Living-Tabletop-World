import type { Translate as T } from '@ltw/ui';

import type { GlyphName } from '../visual/ui-kit-names.ts';
import type { MoveKind, MoveOption } from './move-options.ts';

/**
 * The words and glyphs of the ways to move (docs/adr/0049-space-and-movement.md §5–8): a tray
 * button's name and its cost under it, and the side panel's line on what the way does.
 */
const GLYPHS: Readonly<Record<MoveKind, GlyphName>> = {
  move: 'move',
  land: 'chevron-down',
  crawl: 'prone',
  jump: 'speed',
  drop: 'falling',
  rise: 'chevron-down',
  descend: 'chevron-down',
  dismount: 'move',
};

export const moveGlyph = (option: MoveOption): GlyphName => GLYPHS[option.kind];

/** How far a flyer's rise or descent goes, in feet. */
const verticalFt = (option: MoveOption): number => option.costFt;

export function moveLabel(t: T, option: MoveOption): string {
  switch (option.kind) {
    case 'move':
      return t('Move here');
    case 'land':
      return t('Land here');
    case 'crawl':
      return t('Crawl here');
    case 'jump':
      return t('Jump here');
    case 'drop':
      return t('Drop down here');
    case 'rise':
      return t('Fly up {feet} ft', { feet: verticalFt(option) });
    case 'descend':
      return t('Fly down {feet} ft', { feet: verticalFt(option) });
    case 'dismount':
      return t('Dismount here');
  }
}

/**
 * The cost under a tray button: about how far it goes, or how far it falls; none for a rise or a
 * descent, whose name says its feet.
 */
export const moveNote = (t: T, option: MoveOption): string | null =>
  option.kind === 'rise' || option.kind === 'descend'
    ? null
    : option.kind === 'dismount'
      ? t('half your Speed')
      : option.kind === 'drop'
        ? t('a fall of {feet} ft', { feet: option.fallFt ?? 0 })
        : t('about {feet} ft', { feet: option.costFt });

/** The side panel's line on a way beside the plain route; null for the route itself. */
export function moveDetail(t: T, option: MoveOption): string | null {
  switch (option.kind) {
    case 'land':
      return t('Landing there: about {feet} ft in all.', { feet: option.costFt });
    case 'crawl':
      return t('Crawling there: about {feet} ft, and you stay Prone.', { feet: option.costFt });
    case 'jump':
      return t(
        'Jumping there: {feet} ft. A long jump clears your Strength score in feet after 10 ft on foot, half that standing; landing in Difficult Terrain asks a DC 10 Acrobatics check.',
        { feet: option.costFt },
      );
    case 'drop':
      return t('Dropping down: a fall of {feet} ft, 1d6 Bludgeoning damage per 10 ft, and Prone.', {
        feet: option.fallFt ?? 0,
      });
    case 'dismount':
      return t('Getting down here takes half your Speed; your mount stays where it is.');
    default:
      return null;
  }
}
