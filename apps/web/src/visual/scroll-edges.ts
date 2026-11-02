import { useEffect, useState, type RefObject } from 'react';

export interface ScrollEdges {
  /** Content hides beyond the start (left) edge. */
  readonly before: boolean;
  /** Content hides beyond the end (right) edge. */
  readonly after: boolean;
}

/**
 * Whether a box that scrolls sideways has more beyond either edge, for an edge fade that says so
 * (a cut without one reads as the end). Measured on scroll, on resize and whenever `content` —
 * a key of what the box holds — changes.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, content: string): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ before: false, after: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const before = box.scrollLeft > 1;
      const after = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
      setEdges((shown) =>
        shown.before === before && shown.after === after ? shown : { before, after },
      );
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      box.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [ref, content]);
  return edges;
}
