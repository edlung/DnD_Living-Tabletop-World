import type { EncounterView } from '@ltw/contracts';
import { useEffect, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useReservedHeight } from '../shell/reserved-height.ts';

/**
 * The card a reaction asks with (an alert dialog): announced once, by taking focus, once per
 * window; while a modal book covers the stage it waits, and takes focus when the book has closed.
 * Its height is kept (`--prompt-h`): on a phone the result of an action stands above it.
 */
export function useAnnounceOnce(blocked: boolean) {
  const card = useReservedHeight<HTMLElement>('--prompt-h', true);
  const focused = useRef(false);
  useEffect(() => {
    const element = card.current;
    if (blocked || focused.current || !element) return;
    element.focus({ preventScroll: true });
    focused.current = document.activeElement === element;
  }, [blocked]);
  return card;
}

export interface ReactionPromptProps {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  /** A modal dialog (the Chronicle) is open: everything behind it is inert. */
  readonly blocked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}
