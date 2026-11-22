import { useEffect, type RefObject } from 'react';

/**
 * The room the table's column of banners and cards has on a phone
 * (docs/adr/0071-memory-and-ritual.md §1–4: the lobby may hold the next game, the agreement's
 * card, the stars card and "Previously…" at once). The column stands above the dock and grows
 * upward; this keeps the top bar's real height on it (a phone's bar has two or three rows), so
 * its styles can stop it under the bar and let it scroll, and says on which side more is hidden,
 * for an edge that fades. It also keeps the column's own height on the world screen (`--asks-h`):
 * a section that takes the stage starts its content under the column, so no card of the table's
 * lies over a section's controls (work-orders/FULLSCREEN_SECTIONS_2026-11-21.md).
 */
export function useSlotRoom(slot: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const box = slot.current;
    if (!box) return undefined;
    const bar = document.querySelector<HTMLElement>('.topbar');
    const host = box.closest<HTMLElement>('.world-main');
    let lastHeight = -1;
    const measure = () => {
      const under = Math.max(0, Math.round(bar?.getBoundingClientRect().bottom ?? 0));
      box.style.setProperty('--topbar-real-h', `${String(under)}px`);
      const height = box.offsetHeight;
      if (host && height !== lastHeight) {
        lastHeight = height;
        host.style.setProperty('--asks-h', `${String(height)}px`);
      }
      box.toggleAttribute('data-more-before', box.scrollTop > 1);
      box.toggleAttribute(
        'data-more-after',
        box.scrollTop + box.clientHeight < box.scrollHeight - 1,
      );
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const resized = new ResizeObserver(measure);
    resized.observe(box);
    if (bar) resized.observe(bar);
    // Cards come and go inside an unchanged box.
    const changed = new MutationObserver(measure);
    changed.observe(box, { childList: true, subtree: true });
    return () => {
      box.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      resized.disconnect();
      changed.disconnect();
      host?.style.removeProperty('--asks-h');
    };
  }, [slot]);
}
