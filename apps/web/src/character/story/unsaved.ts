import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * What a hero's sheet holds unsaved (docs/adr/0073-table-ideas.md §5): the Story tab's fields tell
 * the dialog while they hold words nobody saved, and the dialog asks before it closes on them.
 */
export interface Unsaved {
  report(key: string, dirty: boolean): void;
}

export const UnsavedContext = createContext<Unsaved | null>(null);

/**
 * Tells the sheet around it that `key` holds unsaved words, and takes that back when it goes —
 * before the frame that shows it: once "Saved." is on screen, Escape closes the sheet without
 * asking (a later effect left a frame in which saved words still counted as unsaved).
 */
export function useUnsaved(key: string, dirty: boolean): void {
  const unsaved = useContext(UnsavedContext);
  useLayoutEffect(() => {
    unsaved?.report(key, dirty);
    return () => {
      unsaved?.report(key, false);
    };
  }, [unsaved, key, dirty]);
}
