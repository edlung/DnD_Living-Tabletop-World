import { useCallback, useEffect, useRef } from 'react';

/** Event-driven requests belong to this mount, even while its owner client remains open. */
export function useRequestSignal(): () => AbortSignal {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => {
      current.abort();
    };
  }, []);
  return useCallback(() => controller.current.signal, []);
}
