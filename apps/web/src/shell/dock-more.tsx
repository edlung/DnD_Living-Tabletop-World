import { useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { DOCK_MORE_ID } from './use-shell.ts';

/**
 * More (docs/adr/0043-dm-screen.md §3): the dock's items that do not fit its screen, in a list
 * that rises over the dock. Choosing one closes the list and leaves focus on More, so a sheet or
 * dialog it opens gives focus back there. More looks chosen while one of its sheets is open and
 * carries the marker of anything waiting under it.
 */
export function DockMore({
  open,
  onOpen,
  current,
  waiting,
  children,
}: {
  /** The list is open: the dock keeps it, so measuring the dock again keeps it open. */
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  /** One of the items under More is open. */
  readonly current: boolean;
  /** What waits under More (the DM's open draft, new messages), as words. */
  readonly waiting: string;
  /** The items, each given `pick` to call before it acts. */
  readonly children: (pick: () => void) => ReactNode;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pick = () => {
    button.current?.focus({ preventScroll: true });
    onOpen(false);
  };
  // A press anywhere else closes the list; Escape closes it before anything under it (captured
  // first, so the shell's Escape sees it handled), wherever focus is — Safari leaves a tapped
  // button unfocused.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return;
      onOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      button.current?.focus({ preventScroll: true });
      onOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, onOpen]);
  return (
    <div ref={box} className="dock-more">
      <button
        ref={button}
        id={DOCK_MORE_ID}
        type="button"
        className={`dock-button${current ? ' is-current' : ''}${waiting ? ' has-waiting' : ''}`}
        aria-label={t('More tools')}
        aria-expanded={open}
        aria-controls={`${DOCK_MORE_ID}-list`}
        aria-describedby={waiting ? `${DOCK_MORE_ID}-waiting` : undefined}
        onClick={() => {
          onOpen(!open);
        }}
      >
        <Glyph name="more" />
        {waiting && <span className="dock-marker" aria-hidden="true" />}
        <span className="dock-label" aria-hidden="true">
          {t('More')}
        </span>
        <span className="dock-short" aria-hidden="true">
          {t('More')}
        </span>
      </button>
      {waiting && (
        <span id={`${DOCK_MORE_ID}-waiting`} className="visually-hidden">
          {waiting}
        </span>
      )}
      <ul
        id={`${DOCK_MORE_ID}-list`}
        className="dock-more-list"
        aria-label={t('More tools')}
        hidden={!open}
      >
        {children(pick)}
      </ul>
    </div>
  );
}
