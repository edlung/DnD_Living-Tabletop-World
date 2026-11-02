import { useEffect, useState, type RefObject } from 'react';

export interface ScrollEdges {
  /** Content hides beyond the start (left, or top) edge. */
  readonly before: boolean;
  /** Content hides beyond the end (right, or bottom) edge. */
  readonly after: boolean;
}

/**
 * Whether a box that scrolls sideways (or, on `y`, up and down) has more beyond either edge, for an
 * edge fade that says so (a cut without one reads as the end). Measured on scroll, on resize and
 * whenever `content` — a key of what the box holds — changes.
 */
export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  content: string,
  axis: 'x' | 'y' = 'x',
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ before: false, after: false });
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const [start, size, whole] =
        axis === 'x'
          ? [box.scrollLeft, box.clientWidth, box.scrollWidth]
          : [box.scrollTop, box.clientHeight, box.scrollHeight];
      const before = start > 1;
      const after = start + size < whole - 1;
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
  }, [ref, content, axis]);
  return edges;
}
