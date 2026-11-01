import { useEffect, type RefObject } from 'react';

/**
 * A fight that begins takes the stage (Stage 540 walkthrough): the selection's panel — a place, a
 * person met before — steps aside so the battlefield has its room, and focus that was in the panel
 * goes to the world, never to a hidden element.
 */
export function useFightTakesStage(
  fightId: string | null,
  panel: RefObject<HTMLElement | null>,
  closePanel: () => void,
): void {
  useEffect(() => {
    if (fightId === null) return;
    if (panel.current?.contains(document.activeElement)) {
      document.getElementById('world-main')?.focus();
    }
    closePanel();
  }, [fightId]);
}
