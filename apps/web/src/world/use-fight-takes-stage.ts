import type { EncounterView } from '@ltw/contracts';
import { useEffect, type RefObject } from 'react';
import { askedWindowOf } from '../combat/reaction-prompt.tsx';
import type { Shell } from '../shell/use-shell.ts';

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

/** The ordinary prompt takes the stage. A modal player prompt can leave a draft open behind it. */
export function useReactionStage(
  encounter: EncounterView | null,
  actorId: string | null,
  shell: Shell,
  modal: boolean,
) {
  const windowId = askedWindowOf(encounter, actorId);
  useEffect(() => {
    if (windowId === null || modal) return;
    shell.closeChronicle();
    shell.closeHero();
  }, [windowId, modal]);
}
