import type { RollEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { rollSentence } from './words.ts';

/**
 * The latest roll in words for screen readers (Stage 510): the dice on the screen are decorative.
 * Rendered where the viewer is — the world, or inside the character dialog while it is open.
 */
export function RollAnnouncer({ entry }: { readonly entry: RollEntry | null }) {
  const t = useT();
  return (
    <p className="visually-hidden roll-announcer" aria-live="polite">
      {entry ? rollSentence(t, entry) : ''}
    </p>
  );
}
