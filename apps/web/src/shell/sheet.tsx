import { useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { sheetElementId, type SheetId } from './use-shell.ts';

/**
 * A sheet rising over the lower stage from the dock (docs/STAGE_320_DESIGN.md §5.1): the scene
 * stays visible above it. A closed sheet stays mounted and `hidden`, so drafts, choices and
 * unsubmitted intent survive both closing and every live refresh (ADR 0033). Opening moves
 * focus into it; closing returns focus to its dock button.
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
        <IconButton
          glyph="close"
          className="sheet-close"
          label={t('Close {name}', { name: title })}
          onClick={onClose}
        />
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
