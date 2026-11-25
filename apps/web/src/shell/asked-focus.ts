import { useEffect, useRef } from 'react';

/**
 * A question that takes the place of the button that asked it ("End the fight" → "End the fight
 * for everyone?" with its two answers). The button leaves the page when the question appears, and
 * the answers leave it when the question is withdrawn: without a hand, the focus falls to the page
 * each time and a keyboard or a screen reader loses its place and never hears the question.
 *
 * The careful answer takes the focus when the question appears — a choice that cannot be undone is
 * never one key press from the press that asked (ADR 0036's rule for a deliberate choice) — and
 * the asking button gets it back when the question is withdrawn.
 */
export function useAskedFocus<Ask extends HTMLElement, Careful extends HTMLElement>(
  asking: boolean,
) {
  const ask = useRef<Ask>(null);
  const careful = useRef<Careful>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asking) careful.current?.focus();
    else if (asked.current) ask.current?.focus();
    asked.current = asking;
  }, [asking]);
  return { ask, careful };
}
