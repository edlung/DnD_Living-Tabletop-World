import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How the dock fits its screen (docs/adr/0043-dm-screen.md §3): every item with its full words;
 * where they do not fit, the short words ("Add", "Time"); where those do not fit either, items
 * leave the dock's end for More, one at a time. Measured, never guessed from the width: words
 * differ by language and font, and the DM's tools by campaign. Nothing scrolls sideways.
 */
export interface DockFit {
  readonly words: 'full' | 'short';
  /** How many of the dock's items stay on it, in order; the rest wait under More. */
  readonly shown: number;
}

interface Measured extends DockFit {
  /** The items, their words and the width this fit was measured for. */
  readonly key: string;
}

/**
 * The dock is wider than its room, a word is cut inside its button, or a word is wider than its
 * button and runs past its edge into the next one.
 */
function overflows(dock: HTMLElement): boolean {
  if (dock.scrollWidth > dock.clientWidth + 1) return true;
  const spills = (box: HTMLElement) =>
    box.scrollWidth > box.clientWidth + 1 && box.checkVisibility();
  return [
    ...dock.querySelectorAll<HTMLElement>(
      '.dock-items .dock-label, .dock-items .dock-short, .dock-items .dock-button',
    ),
  ].some(spills);
}

export function useDockFit(
  dock: RefObject<HTMLElement | null>,
  count: number,
  /** The items' words: another language or another set of tools measures again. */
  words: string,
  /** Told the fit each time the dock is found to fit. */
  onFits?: (fit: DockFit) => void,
): DockFit {
  // The stage's width, and whether the fonts have arrived: either measures again.
  const [room, setRoom] = useState('');
  const key = `${String(count)}|${words}|${room}`;
  const [fit, setFit] = useState<Measured>({ key, words: 'full', shown: count });
  const current: Measured = fit.key === key ? fit : { key, words: 'full', shown: count };
  useLayoutEffect(() => {
    const element = dock.current;
    if (element && overflows(element)) {
      if (current.words === 'full') setFit({ ...current, words: 'short' });
      else if (current.shown > 1) setFit({ ...current, shown: current.shown - 1 });
      else if (current !== fit) setFit(current);
    } else {
      if (current !== fit) setFit(current);
      onFits?.(current);
    }
  });
  useEffect(() => {
    const stage = dock.current?.parentElement;
    if (!stage) return;
    let fonts = 'loading';
    let width = 0;
    const measure = () => {
      setRoom(`${String(width)}|${fonts}`);
    };
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next === width) return;
      width = next;
      measure();
    });
    observer.observe(stage);
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      fonts = 'ready';
      measure();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [dock]);
  return current;
}
