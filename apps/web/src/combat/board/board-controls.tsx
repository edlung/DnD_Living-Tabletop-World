import { useT } from '@ltw/ui';

import { IconButton } from '../../visual/icon-button.tsx';
import type { BoardView } from './board-view.ts';

/**
 * How to look at the board (docs/STAGE_320_DESIGN.md §5.5–6): flat or tilted like a table, and
 * on a phone, closer or further. Glyph controls with their words as name and tooltip.
 */
export function BoardControls({ view }: { readonly view: BoardView }) {
  const t = useT();
  return (
    <div className="board-controls" role="group" aria-label={t('Board view')}>
      <IconButton
        glyph="flat"
        label={t('Flat board')}
        aria-pressed={view.mode === 'flat'}
        onClick={() => {
          view.choose('flat');
        }}
      />
      <IconButton
        glyph="tilt"
        label={t('Tilted board')}
        aria-pressed={view.mode === 'tilted'}
        onClick={() => {
          view.choose('tilted');
        }}
      />
      {view.narrow && (
        <>
          <IconButton
            glyph="zoom-out"
            label={t('Zoom out')}
            disabled={view.zoomOut === null}
            onClick={() => view.zoomOut?.()}
          />
          <IconButton
            glyph="zoom-in"
            label={t('Zoom in')}
            disabled={view.zoomIn === null}
            onClick={() => view.zoomIn?.()}
          />
        </>
      )}
    </div>
  );
}
