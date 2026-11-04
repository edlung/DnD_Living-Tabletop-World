import type { Square } from '@ltw/contracts';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { DRAG_SLOP, squareAt, swallowNextClick } from './pointer-squares.ts';

/**
 * A stroke of the DM's brush across the board (docs/adr/0057-encounters-maps-loot.md §2): a press
 * on a square that moves 8 px or more gathers every square the pointer passes, in order, and
 * paints them all as it lifts — one command for the stroke. A press that does not move is the
 * square's own click (the keyboard's way too), which paints that square alone.
 */
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;

export function usePaintStroke(onStroke: ((squares: readonly Square[]) => void) | undefined) {
  const stroke = useRef<{ x0: number; y0: number; moved: boolean; squares: Square[] } | null>(null);
  // The squares of the stroke under way, lit as it goes.
  const [lit, setLit] = useState<ReadonlySet<string>>(new Set());
  const start = (square: Square, event: ReactPointerEvent) => {
    if (!onStroke || event.button !== 0) return;
    stroke.current = { x0: event.clientX, y0: event.clientY, moved: false, squares: [square] };
    const move = (moved: PointerEvent) => {
      const known = stroke.current;
      if (!known) return;
      if (
        !known.moved &&
        Math.hypot(moved.clientX - known.x0, moved.clientY - known.y0) < DRAG_SLOP
      )
        return;
      const first = !known.moved;
      known.moved = true;
      const under = squareAt(moved.clientX, moved.clientY);
      const added = under !== null && !known.squares.some((one) => key(one) === key(under));
      if (added) known.squares.push(under);
      if (first || added) setLit(new Set(known.squares.map(key)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      stroke.current = null;
      setLit(new Set());
    };
    const up = () => {
      const known = stroke.current;
      stop();
      if (!known?.moved) return;
      swallowNextClick();
      onStroke(known.squares);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
  };
  return {
    start,
    lit,
    enabled: onStroke !== undefined,
    isLit: (square: Square) => lit.has(key(square)),
  };
}
