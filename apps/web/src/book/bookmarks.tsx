import { useT } from '@ltw/ui';

import type { SheetId, Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';

/**
 * The book's bookmarks (docs/adr/0074-dm-book.md §3.7): its two views — the pages and the
 * contents — and the dock's sections a meeting needs, each one press away. A section opened here
 * returns to the book, at the same page, when it is closed.
 */
const MARKS: readonly {
  readonly sheet: SheetId;
  readonly label: string;
  readonly glyph: GlyphName;
}[] = [
  { sheet: 'party', label: 'Heroes', glyph: 'party' },
  { sheet: 'places', label: 'Places', glyph: 'place' },
  { sheet: 'journal', label: 'Journal', glyph: 'journal' },
  { sheet: 'encounter', label: 'Encounter', glyph: 'encounter' },
  // The table's dice: a roll the text did not foresee is asked there (ADR 0074 §4.2).
  { sheet: 'dice', label: 'Dice', glyph: 'roll' },
  { sheet: 'session', label: 'Session', glyph: 'chapter' },
  { sheet: 'rules', label: 'Rules', glyph: 'study' },
  { sheet: 'history', label: 'History', glyph: 'history' },
];

export function BookMarks({
  view,
  shell,
  onView,
}: {
  readonly view: 'spread' | 'path';
  readonly shell: Shell;
  readonly onView: (view: 'spread' | 'path') => void;
}) {
  const t = useT();
  return (
    <nav className="dmb-marks" aria-label={t('Bookmarks')}>
      <button
        type="button"
        className="dmb-mark"
        aria-pressed={view === 'spread'}
        aria-label={t('Pages')}
        title={t('Pages')}
        onClick={() => {
          onView('spread');
        }}
      >
        <Glyph name="perform" />
        <span className="dmb-mark-word">{t('Pages')}</span>
      </button>
      <button
        type="button"
        className="dmb-mark"
        aria-pressed={view === 'path'}
        aria-label={t('The path')}
        title={t('The path')}
        onClick={() => {
          onView('path');
        }}
      >
        <Glyph name="travel" />
        <span className="dmb-mark-word">{t('The path')}</span>
      </button>
      {MARKS.map((mark) => (
        <button
          key={mark.sheet}
          type="button"
          className="dmb-mark"
          aria-label={t(mark.label)}
          title={t(mark.label)}
          onClick={() => {
            shell.openSheetFromBook(mark.sheet);
          }}
        >
          <Glyph name={mark.glyph} />
          <span className="dmb-mark-word">{t(mark.label)}</span>
        </button>
      ))}
      <button
        type="button"
        className="dmb-mark"
        aria-label={t('Chronicle')}
        title={t('Chronicle')}
        onClick={() => {
          shell.openChronicle();
        }}
      >
        <Glyph name="chronicle" />
        <span className="dmb-mark-word">{t('Chronicle')}</span>
      </button>
    </nav>
  );
}
