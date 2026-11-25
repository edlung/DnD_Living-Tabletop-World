import { useLayoutEffect, useRef } from 'react';

/** The measured heights the world screen keeps room for (`responsive.css`, `battle-layout.css`). */
export type ReservedHeight =
  '--active-h' | '--outcome-h' | '--prompt-h' | '--talk-h' | '--tray-h' | '--turn-h';

/**
 * Keeps an element's height on the world screen as a custom property while it shows, so the
 * scrolling surfaces under a fixed result or turn tray leave room for it below their content
 * and no control stays under it (design §6–7).
 */
export function useReservedHeight<T extends HTMLElement>(property: ReservedHeight, shown: boolean) {
  const box = useRef<T>(null);
  useLayoutEffect(() => {
    const element = box.current;
    const host = element?.closest<HTMLElement>('.world-main');
    if (!element || !host) return;
    let lastHeight = -1;
    let frame: number | undefined;
    const measure = () => {
      const height = element.offsetHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      host.style.setProperty(property, `${String(height)}px`);
    };
    measure();
    // Updating the ancestor during observer delivery can resize this box again in the
    // same layout cycle. Keep the first measurement synchronous, then coalesce changes.
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      host.style.removeProperty(property);
    };
  }, [property, shown]);
  return box;
}
