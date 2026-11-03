import { useLayoutEffect, useRef, useState } from 'react';

import type { Size } from './geometry.ts';

/** The space the board is given, as laid out by the stylesheet for this width. */
export function useSpace(): [React.RefObject<HTMLDivElement | null>, Size | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSpace((known) =>
        known?.width === width && known.height === height ? known : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, space];
}
