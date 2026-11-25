import { useLayoutEffect, type RefObject } from 'react';

import { ORDER_COLUMN, useMedia } from './board-view.ts';

/** Room enough beside the map for the cards' margin (288 px and its gap), in CSS pixels. */
export const SPARE_BESIDE = 300;
/**
 * Room enough under the map for a card. The tallest things that must not scroll there — how to
 * read the board, a hero's own card with its armour class and conditions — are some 300 px.
 */
export const SPARE_BELOW = 330;

/**
 * The room a board leaves on its sheet (docs/adr/0075-book-interface.md §26): beside itself (a
 * laptop's window, where the sheet is wider than the map is — a tilted board most of all), or
 * under itself where the order of turns is a row (a tablet held upright). The fight's panel is
 * told which (`data-spare`, and `--board-spare` for the room under it), so its stylesheet lays
 * the cards there instead of over the map (`styles/fight-cards.css`). The cards lie in the
 * board's own cell, so telling changes nothing the board measures. A board outside a fight's
 * panel (the table's screen, a builder) tells no one.
 */
export function useSpareRoom(
  board: RefObject<HTMLElement | null>,
  beside: number | null,
  below: number | null,
): void {
  const column = useMedia(ORDER_COLUMN);
  const where =
    beside !== null && beside >= SPARE_BESIDE
      ? 'beside'
      : below !== null && !column && below >= SPARE_BELOW
        ? 'below'
        : null;
  const room = where === 'below' && below !== null ? Math.floor(below) : null;
  useLayoutEffect(() => {
    const panel = board.current?.closest<HTMLElement>('.combat-panel');
    if (!panel || where === null) return;
    panel.dataset['spare'] = where;
    if (room !== null) panel.style.setProperty('--board-spare', `${String(room)}px`);
    return () => {
      delete panel.dataset['spare'];
      panel.style.removeProperty('--board-spare');
    };
  }, [board, where, room]);
}
