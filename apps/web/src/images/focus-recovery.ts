import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { useDmImages } from './dm-images.ts';

/**
 * Focus after the DM's image command (docs/STAGE_330_DESIGN.md "DM controls"; Stage 320 design
 * §7: focus is never lost). Approve, Discard and Try again take away the card they were pressed
 * on, and an entity whose work is done leaves the Images sheet. When the command's result shows
 * at the place it was given — once per command, never on a later read of the lineage — and focus
 * was lost with the card, it goes to the card that followed it, else the entity's heading, else
 * the place itself (the panel's section, the sheet). When the answer is lost and the card went
 * meanwhile (the change was made; the live lineage showed it), focus goes to Retry. A control
 * that waits for a command keeps focus (`aria-disabled`), so a card that stays keeps it.
 *
 * Markup: a card or a request row carries `data-image-key` (its asset or request ID), the
 * entity's group `data-image-entity`, and the group's focusable heading `data-image-heading`.
 */
interface Plan {
  readonly id: number;
  /** The cards after the one acted on, in order, within its entity's group. */
  readonly following: readonly string[];
  readonly entity: string | null;
}

const byKey = (root: HTMLElement, attribute: string, value: string) =>
  root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`);

/** The first control of a card that is not waiting: where the DM can go on. */
const firstControl = (card: HTMLElement) =>
  card.querySelector<HTMLElement>('button:not([disabled]):not([aria-disabled="true"])');

function lost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

export function useFocusRecovery(
  root: RefObject<HTMLElement | null>,
  place: string,
  /** The place to focus last: the root itself unless given. */
  fallback: () => HTMLElement | null = () => root.current,
): void {
  const images = useDmImages();
  const command = images?.command ?? null;
  const lineage = images?.lineage ?? null;
  const plan = useRef<Plan | null>(null);
  const recovered = useRef(0);
  const offered = useRef(0);
  const id = command?.id ?? 0;
  const status = command?.status ?? 'idle';
  const mine = command?.place === place;

  // While the card is still shown: what follows it.
  useLayoutEffect(() => {
    const element = root.current;
    const target = command?.target;
    if (!mine || status !== 'busy' || plan.current?.id === id || !element || !target) return;
    const card = byKey(element, 'data-image-key', target);
    const group = card?.closest<HTMLElement>('[data-image-entity]') ?? null;
    const cards = group ? [...group.querySelectorAll<HTMLElement>('[data-image-key]')] : [];
    const index = card ? cards.indexOf(card) : -1;
    plan.current = {
      id,
      following:
        index < 0 ? [] : cards.slice(index + 1).map((next) => next.dataset['imageKey'] ?? ''),
      entity: group?.dataset['imageEntity'] ?? null,
    };
  }, [id, status, mine]);

  // A lost answer: Retry, once, when focus went with the card — the live lineage may show the
  // change was made, and take the card, only after the answer was lost.
  useEffect(() => {
    const element = root.current;
    if (!mine || status !== 'uncertain' || offered.current === id || !element || !lost()) return;
    const retry = element.querySelector<HTMLElement>('[data-image-retry]');
    if (!retry) return;
    offered.current = id;
    retry.focus();
  }, [id, status, mine, lineage]);

  // Once its result shows: only if focus went with the card.
  useEffect(() => {
    const element = root.current;
    if (!mine || status !== 'done' || recovered.current === id || !element) return;
    recovered.current = id;
    if (!lost()) return;
    const known = plan.current?.id === id ? plan.current : null;
    for (const key of known?.following ?? []) {
      const card = byKey(element, 'data-image-key', key);
      const control = card ? firstControl(card) : null;
      if (control) {
        control.focus();
        return;
      }
    }
    const group = known?.entity ? byKey(element, 'data-image-entity', known.entity) : null;
    const heading = group?.querySelector<HTMLElement>('[data-image-heading]');
    if (heading) {
      heading.focus();
      return;
    }
    fallback()?.focus({ preventScroll: true });
  }, [id, status, mine]);
}
