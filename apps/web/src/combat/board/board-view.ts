import { useCallback, useState, useSyncExternalStore } from 'react';

/** Where the board stands tilted by default, and where a phone offers zoom (design §6). */
export const WIDE = '(min-width: 1200px)';
export const NARROW = '(max-width: 767px)';

const ZOOMS = [0.75, 1, 1.25, 1.5, 2] as const;

export type BoardMode = 'flat' | 'tilted';

/**
 * How the viewer looks at the board (docs/STAGE_320_DESIGN.md §5.5): flat or tilted like a
 * table, and on a phone how closely. Visual state only: it lives in the screen's memory, never
 * in world state or browser storage. Until the viewer chooses, the board is tilted on a wide
 * screen and flat below 1200 px.
 */
export interface BoardView {
  readonly mode: BoardMode;
  /** The board's scale on a phone; 1 elsewhere. */
  readonly zoom: number;
  readonly narrow: boolean;
  readonly choose: (mode: BoardMode) => void;
  readonly zoomIn: (() => void) | null;
  readonly zoomOut: (() => void) | null;
}

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', changed);
      return () => {
        list.removeEventListener('change', changed);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useBoardView(): BoardView {
  const wide = useMedia(WIDE);
  const narrow = useMedia(NARROW);
  const [chosen, setChosen] = useState<BoardMode | null>(null);
  const [step, setStep] = useState(ZOOMS.indexOf(1));
  return {
    mode: chosen ?? (wide ? 'tilted' : 'flat'),
    zoom: narrow ? (ZOOMS[step] ?? 1) : 1,
    narrow,
    choose: setChosen,
    zoomIn:
      narrow && step < ZOOMS.length - 1
        ? () => {
            setStep(step + 1);
          }
        : null,
    zoomOut:
      narrow && step > 0
        ? () => {
            setStep(step - 1);
          }
        : null,
  };
}
