import { useCallback, useState, useSyncExternalStore } from 'react';

/** Where the board stands tilted by default, and where a phone offers zoom (design §6). */
export const WIDE = '(min-width: 1200px)';
/** A phone, or a phone held wide (some 400 px tall): one column, the flat board. */
export const NARROW = '(max-width: 767px), (max-width: 1199px) and (max-height: 500px)';

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
  /** Relative to the size that fits the available space. */
  readonly zoom: number;
  readonly narrow: boolean;
  readonly choose: (mode: BoardMode) => void;
  readonly zoomIn: (() => void) | null;
  readonly zoomOut: (() => void) | null;
  readonly fit?: () => void;
  readonly minCell?: number;
  readonly sideLabels?: boolean;
  /** The largest square in pixels; the table's screen, seen across a room, allows more. */
  readonly maxCell?: number;
}

export function useMedia(query: string): boolean {
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

/** `prefer`: the view a board opens in before anyone chooses — the builder's board is flat. */
export function useBoardView(prefer?: BoardMode, mapFirst = false): BoardView {
  const wide = useMedia(WIDE);
  const narrow = useMedia(NARROW);
  const zoomable = narrow || mapFirst;
  const [chosen, setChosen] = useState<BoardMode | null>(null);
  const [chosenStep, setStep] = useState<number | null>(null);
  const step = chosenStep ?? ZOOMS.indexOf(mapFirst && (narrow || wide) ? 1.5 : 1);
  return {
    mode: chosen ?? prefer ?? (wide ? 'tilted' : 'flat'),
    zoom: zoomable ? (ZOOMS[step] ?? 1) : 1,
    narrow,
    choose: setChosen,
    ...(mapFirst && {
      maxCell: 180,
      sideLabels: true,
      ...(chosenStep === ZOOMS.indexOf(1) && { minCell: 1 }),
      fit() {
        setChosen('flat');
        setStep(ZOOMS.indexOf(1));
      },
    }),
    zoomIn:
      zoomable && step < ZOOMS.length - 1
        ? () => {
            setStep(step + 1);
          }
        : null,
    zoomOut:
      zoomable && step > 0
        ? () => {
            setStep(step - 1);
          }
        : null,
  };
}
