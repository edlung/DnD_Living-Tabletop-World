import type { Square } from '@ltw/contracts';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * A token dragged to another square (docs/adr/0057-encounters-maps-loot.md §2): the DM's hand.
 * A press on a combatant's square or name plate that moves 8 px or more is a drag; the square
 * under the pointer as it lifts is where the combatant goes. The click a mouse sends after a drag
 * lands on whatever holds both ends, never on a square, so it is swallowed wherever it lands and
 * picks nothing. Without a drop handler a press is only a press. The keyboard's way is to choose
 * the combatant, then the square.
 */
const SLOP = 8;

const squareAt = (x: number, y: number): Square | null => {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('.board-square');
  const sx = Number(element?.dataset['x']);
  const sy = Number(element?.dataset['y']);
  return Number.isInteger(sx) && Number.isInteger(sy) ? { x: sx, y: sy } : null;
};

/** The click that follows a drag in the same task, stopped before anything reads it. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => {
    window.removeEventListener('click', swallow, { capture: true });
  }, 0);
}

export function useTokenDrag(onDrop: ((entityId: string, square: Square) => void) | undefined) {
  const drag = useRef<{ entityId: string; x0: number; y0: number; moved: boolean } | null>(null);
  const [target, setTarget] = useState<Square | null>(null);
  const start = (entityId: string, event: ReactPointerEvent) => {
    if (!onDrop || event.button !== 0) return;
    drag.current = { entityId, x0: event.clientX, y0: event.clientY, moved: false };
    const move = (moved: PointerEvent) => {
      const known = drag.current;
      if (!known) return;
      if (!known.moved && Math.hypot(moved.clientX - known.x0, moved.clientY - known.y0) < SLOP)
        return;
      known.moved = true;
      setTarget(squareAt(moved.clientX, moved.clientY));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      drag.current = null;
      setTarget(null);
    };
    const up = (lifted: PointerEvent) => {
      const known = drag.current;
      stop();
      if (!known?.moved) return;
      swallowNextClick();
      const square = squareAt(lifted.clientX, lifted.clientY);
      if (square) onDrop(known.entityId, square);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
  };
  return { start, target, enabled: onDrop !== undefined };
}
