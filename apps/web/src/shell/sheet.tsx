import { useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import { PlayerCheckCall } from '../dice/player-check-call.tsx';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { sheetElementId, type SheetId } from './use-shell.ts';

/**
 * One of the dock's sections (docs/STAGE_320_DESIGN.md §5.1): it takes the whole stage, the dock
 * staying in reach under it, and closes by its Close button, by Escape or by its dock button. A
 * closed sheet stays mounted and `hidden`, so drafts, choices and unsubmitted intent survive both
 * closing and every live refresh (ADR 0033). Opening moves focus into it; closing returns focus
 * to its dock button.
 */
export function Sheet({
  id,
  title,
  glyph,
  open,
  backToBook = false,
  showPlayerAsks = false,
  onClose,
  children,
}: {
  readonly id: SheetId;
  readonly title: string;
  readonly glyph: GlyphName;
  readonly open: boolean;
  readonly backToBook?: boolean;
  readonly showPlayerAsks?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const shown = useRef(open);
  useEffect(() => {
    if (open && !shown.current) ref.current?.focus({ preventScroll: true });
    shown.current = open;
  }, [open]);
  const titleId = `${sheetElementId(id)}-title`;
  return (
    <section
      ref={ref}
      id={sheetElementId(id)}
      className={`sheet sheet--${id}`}
      aria-labelledby={titleId}
      tabIndex={-1}
      hidden={!open}
    >
      <header className="sheet-header">
        <Glyph name={glyph} className="sheet-glyph" />
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="sheet-close"
          aria-label={
            backToBook
              ? t('Close {name}', { name: title }) + ' · ' + t('Back to book')
              : t('Close {name}', { name: title })
          }
          onClick={onClose}
        >
          {backToBook && <Glyph name="chevron-left" />}
          <span className={backToBook ? 'sheet-back-word' : 'sheet-close-word'} aria-hidden="true">
            {t(backToBook ? 'Back to book' : 'Close')}
          </span>
          {!backToBook && <Glyph name="close" />}
        </button>
      </header>
      {open && showPlayerAsks && <PlayerCheckCall />}
      <div className="sheet-body">{children}</div>
    </section>
  );
}
