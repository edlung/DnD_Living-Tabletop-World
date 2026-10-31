import { useEffect } from 'react';

import { probeWorkshop } from './transport.ts';

/** The shelf and every editor share this owner boundary. */
export function useWorkshopSession(ownerId: string, onEnded: () => void): void {
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    let ended = false;
    const check = async () => {
      if (checking || ended || document.visibilityState !== 'visible') return;
      checking = true;
      const result = await probeWorkshop(controller.signal);
      checking = false;
      if (controller.signal.aborted) return;
      if (
        result.kind === 'signed-out' ||
        (result.kind === 'signed-in' && result.ownerId !== ownerId)
      ) {
        ended = true;
        onEnded();
      }
    };
    const changed = () => {
      void check();
    };
    const timer = window.setInterval(changed, 15_000);
    window.addEventListener('online', changed);
    window.addEventListener('focus', changed);
    document.addEventListener('visibilitychange', changed);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', changed);
      window.removeEventListener('focus', changed);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [ownerId, onEnded]);
}
