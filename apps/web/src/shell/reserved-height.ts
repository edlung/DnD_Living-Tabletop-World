import { useLayoutEffect, useRef } from 'react';

/** The measured heights the world screen keeps room for (`responsive.css`, `battle-layout.css`). */
export type ReservedHeight = '--active-h' | '--outcome-h' | '--tray-h';

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
    const measure = () => {
      host.style.setProperty(property, `${String(element.offsetHeight)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      host.style.removeProperty(property);
    };
  }, [property, shown]);
  return box;
}
