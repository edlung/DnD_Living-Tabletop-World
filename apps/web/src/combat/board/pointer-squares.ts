import type { Square } from '@ltw/contracts';

/**
 * The board's squares under a pointer, for the DM's hand (docs/adr/0057-encounters-maps-loot.md
 * §2): the square drawn at a point of the window, and the click a mouse sends after a drag — on
 * whatever holds both ends, never on a square — swallowed before anything reads it.
 */
export const squareAt = (x: number, y: number): Square | null => {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('.board-square');
  const sx = Number(element?.dataset['x']);
  const sy = Number(element?.dataset['y']);
  return Number.isInteger(sx) && Number.isInteger(sy) ? { x: sx, y: sy } : null;
};

/** The click that follows a drag in the same task, stopped before anything reads it. */
export function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => {
    window.removeEventListener('click', swallow, { capture: true });
  }, 0);
}

/** A drag begins once a press has moved this far (CSS pixels). */
export const DRAG_SLOP = 8;
