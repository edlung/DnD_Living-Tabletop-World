import { useEffect, useRef, useState } from 'react';

/** The dock's sheets (docs/STAGE_320_DESIGN.md §5.1); DM sheets only in the DM perspective. */
export type SheetId = 'places' | 'journal' | 'add' | 'encounter' | 'time' | 'history';

export const sheetElementId = (id: SheetId) => `sheet-${id}`;
export const dockButtonId = (id: SheetId | 'scene' | 'chronicle') => `dock-${id}`;

/** Moves focus to an element still on screen, if there is one. */
export function focusOn(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected || !element.checkVisibility()) return false;
  element.focus({ preventScroll: true });
  return true;
}

/**
 * What the shell shows around the stage: at most one open sheet, the Chronicle book, and which
 * of a sheet or the selection opened last, so Escape closes the topmost and returns focus to
 * where it came from (design §7). Visual state only: it lives in this screen's memory, never in
 * world state or browser storage, and a perspective change starts it afresh.
 */
export function useShell() {
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [chronicle, setChronicle] = useState(false);
  const last = useRef<'sheet' | 'details'>('sheet');
  return {
    sheet,
    chronicle,
    /** The dock: opens a sheet, or closes it when it is already open. */
    toggleSheet: (id: SheetId) => {
      setSheet(sheet === id ? null : id);
      last.current = 'sheet';
    },
    /** Closes the open sheet and returns focus to its dock button. */
    closeSheet: () => {
      if (sheet === null) return;
      focusOn(document.getElementById(dockButtonId(sheet)));
      setSheet(null);
    },
    /** Closes the open sheet without moving focus (what was picked in it took focus). */
    dismissSheet: () => {
      setSheet(null);
    },
    openChronicle: () => {
      setChronicle(true);
    },
    closeChronicle: () => {
      setChronicle(false);
    },
    /** The selection's panel opened: it is now the topmost for Escape. */
    detailsOpened: () => {
      last.current = 'details';
    },
    /** Which of a sheet or the details panel opened last. */
    topmost: () => last.current,
  };
}

export type Shell = ReturnType<typeof useShell>;

/**
 * Escape closes the topmost sheet or panel (design §7); `onEscape` says whether it closed one.
 * A modal dialog (the Chronicle) closes itself, and a reaction question is never dismissed.
 */
export function useEscape(onEscape: () => boolean): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.target instanceof Element && event.target.closest('[role="alertdialog"]')) return;
      if (handler.current()) event.preventDefault();
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
}
