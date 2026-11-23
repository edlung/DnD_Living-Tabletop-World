import { useContext } from 'react';

import { useMedia } from '../combat/board/board-view.ts';
import { SheetSurfaceContext } from '../shell/sheet.tsx';

/**
 * Where the Scene is a spread (docs/adr/0075-book-interface.md §5): a screen wide and tall enough
 * for two facing pages — the place on the left, its plate and the card of what is chosen on the
 * right. Narrower, the Scene stays one page under its picture.
 */
export const SPREAD = '(min-width: 1024px) and (min-height: 600px)';

/** The Scene is drawn as a spread now: in a book, wide enough, and not while a fight holds it. */
export function useSceneSpread(battlefield: boolean): boolean {
  const paper = useContext(SheetSurfaceContext) === 'paper';
  return useMedia(SPREAD) && paper && !battlefield;
}

/** The Scene is a spread on the screen now: a panel on its right page covers nothing. */
export const spreadShown = () => document.querySelector('.scene[data-spread]') !== null;

/** Where the talk lies on the spread: the right page, over the card of the one it is with. */
export const SPREAD_TALK_ID = 'spread-talk';
