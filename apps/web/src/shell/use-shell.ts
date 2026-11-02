import { useEffect, useRef, useState } from 'react';

/**
 * The dock's sheets (docs/STAGE_320_DESIGN.md §5.1); DM sheets only in the DM perspective (the
 * DM's Images, docs/STAGE_330_DESIGN.md "DM controls"), and Players only with production sign-in
 * (docs/adr/0036-production-sign-in.md §4).
 */
export type SheetId =
  | 'places'
  | 'journal'
  | 'dice'
  | 'add'
  | 'encounter'
  | 'time'
  | 'history'
  | 'images'
  | 'players'
  | 'screen'
  | 'party'
  | 'notes';

const SHEETS: readonly SheetId[] = [
  'places',
  'journal',
  'dice',
  'add',
  'encounter',
  'time',
  'history',
  'images',
  'players',
  'screen',
  'party',
  'notes',
];

/**
 * The open sheet, remembered for this tab (docs/adr/0043-dm-screen.md §4): a reload, or an iPad
 * that slept and reloaded the page, comes back to it. Only a sheet's name; never world data. A
 * browser that refuses storage simply forgets.
 */
const storedKey = (key: string) => `ltw.sheet:${key}`;

function rememberedSheet(key: string | undefined): SheetId | null {
  if (key === undefined) return null;
  try {
    const value = sessionStorage.getItem(storedKey(key));
    return SHEETS.find((id) => id === value) ?? null;
  } catch {
    return null;
  }
}

function rememberSheet(key: string | undefined, sheet: SheetId | null): void {
  if (key === undefined) return;
  try {
    if (sheet === null) sessionStorage.removeItem(storedKey(key));
    else sessionStorage.setItem(storedKey(key), sheet);
  } catch {
    // Storage refused (a private window): the sheet is simply not remembered.
  }
}

/** The character dialog's tabs (Stage 500). */
export type HeroTab = 'overview' | 'skills' | 'spells' | 'inventory';

export const sheetElementId = (id: SheetId) => `sheet-${id}`;
export const dockButtonId = (id: SheetId | 'scene' | 'chronicle' | 'character') => `dock-${id}`;

/** Moves focus to an element still on screen, if there is one. */
export function focusOn(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected || !element.checkVisibility()) return false;
  element.focus({ preventScroll: true });
  return true;
}

/**
 * What the shell shows around the stage: at most one open sheet, the Chronicle book, and which
 * of a sheet or the selection opened last, so Escape closes the topmost and returns focus to
 * where it came from (design §7). Visual state only, never in world state; the open sheet is
 * remembered for the tab under `rememberAs` (the perspective), so a reload comes back to it.
 */
export function useShell(rememberAs?: string) {
  const [sheet, setOpenSheet] = useState<SheetId | null>(() => rememberedSheet(rememberAs));
  const setSheet = (next: SheetId | null) => {
    setOpenSheet(next);
    rememberSheet(rememberAs, next);
  };
  const [chronicle, setChronicle] = useState(false);
  // The character dialog (Stage 500): whose sheet is open, and the tab it was last read at.
  const [hero, setHero] = useState<string | null>(null);
  const [heroTab, setHeroTab] = useState<HeroTab>('overview');
  const last = useRef<'sheet' | 'details'>('sheet');
  return {
    sheet,
    chronicle,
    hero,
    heroTab,
    /** Opens a character's dialog, at a tab when one is named (else where it was last read). */
    openHero: (entityId: string, tab?: HeroTab) => {
      setHero(entityId);
      if (tab) setHeroTab(tab);
    },
    closeHero: () => {
      setHero(null);
    },
    showHeroTab: setHeroTab,
    /** The dock: opens a sheet, or closes it when it is already open. */
    toggleSheet: (id: SheetId) => {
      setSheet(sheet === id ? null : id);
      last.current = 'sheet';
    },
    /** Opens a sheet from elsewhere (an NPC card's edit opens its proposal under Add). */
    openSheet: (id: SheetId) => {
      setSheet(id);
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

/** Text-entry inputs: Escape in one that holds a draft never closes what holds it. */
const TEXT_INPUTS: ReadonlySet<string> = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'number',
  'password',
]);

/**
 * Whether Escape was pressed inside a text field that holds something: a draft is never closed
 * away by the key that, in a field, people press to undo a suggestion or leave a menu.
 */
export function isDraftField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return target.value.trim() !== '';
  if (target instanceof HTMLInputElement) {
    // A read-only field (a link shown to copy) holds no draft of the person's.
    return TEXT_INPUTS.has(target.type) && !target.readOnly && target.value.trim() !== '';
  }
  return target instanceof HTMLElement && target.isContentEditable
    ? target.textContent.trim() !== ''
    : false;
}

/**
 * Escape closes the topmost sheet or panel (design §7); `onEscape` says whether it closed one.
 * A modal dialog (the Chronicle) closes itself, a reaction question is never dismissed, and
 * Escape inside a text field that holds a draft closes nothing.
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
      if (isDraftField(event.target)) return;
      if (handler.current()) event.preventDefault();
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
}
