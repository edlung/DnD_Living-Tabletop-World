import { useT } from '@ltw/ui';

import { PartIcon } from '../book-kit/kit.tsx';
import { Glyph } from '../visual/glyph.tsx';

/**
 * The book's own two views (docs/adr/0074-dm-book.md §3.7): its pages and its contents. The
 * sections the dock held are parts and pages of the DM's book itself now
 * (docs/adr/0075-book-interface.md §3), one bookmark away at the fore-edge.
 */
export function BookMarks({
  view,
  onView,
}: {
  readonly view: 'spread' | 'path';
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
        <PartIcon part="story" glyph="perform" />
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
    </nav>
  );
}
