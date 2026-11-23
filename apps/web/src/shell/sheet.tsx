import { useT } from '@ltw/ui';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { sheetElementId, type SheetId } from './use-shell.ts';

/**
 * The surface a screen gives its sections: the DM's book lays every one on paper
 * (docs/adr/0075-book-interface.md §3); elsewhere a section keeps the dark glass.
 */
export const SheetSurfaceContext = createContext<'paper' | null>(null);

/** The surface for an element's `data-surface`: paper in a book, nothing elsewhere. */
export const usePaperSurface = (): 'paper' | undefined =>
  useContext(SheetSurfaceContext) ?? undefined;

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
  onClose,
  children,
}: {
  readonly id: SheetId;
  readonly title: string;
  readonly glyph: GlyphName;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const t = useT();
  const surface = useContext(SheetSurfaceContext);
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
      data-surface={surface ?? undefined}
    >
      <header className="sheet-header">
        <Glyph name={glyph} className="sheet-glyph" />
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="sheet-close"
          aria-label={t('Close {name}', { name: title })}
          onClick={onClose}
        >
          <span className="sheet-close-word" aria-hidden="true">
            {t('Close')}
          </span>
          <Glyph name="close" />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
