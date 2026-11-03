import type { Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { IconButton } from '../../visual/icon-button.tsx';
import type { BoardView } from './board-view.ts';

/** The viewer's own tools: the ruler and a spell's area (docs/adr/0057-…md §5). */
export interface BoardTools {
  readonly measuring: boolean;
  readonly laying: boolean;
  readonly onMeasure: () => void;
  readonly onArea: () => void;
}

/** The DM's brush on the board (docs/adr/0057-encounters-maps-loot.md §2). */
export interface BoardPaint {
  readonly on: boolean;
  readonly onToggle: () => void;
  /** Squares pressed or stroked while the brush is on, in the order the pointer passed them. */
  readonly onStroke: (squares: readonly Square[]) => void;
}

/**
 * How to look at the board (docs/STAGE_320_DESIGN.md §5.5–6): flat or tilted like a table, and
 * on a phone, closer or further; for the DM, the brush that paints the ground. Glyph controls with
 * their words as name and tooltip.
 */
export function BoardControls({
  view,
  paint,
  tools,
}: {
  readonly view: BoardView;
  readonly paint?: BoardPaint;
  readonly tools?: BoardTools;
}) {
  const t = useT();
  return (
    <div className="board-controls" role="group" aria-label={t('Board view')}>
      {tools && (
        <>
          <IconButton
            glyph="speed"
            label={t('Measure')}
            aria-pressed={tools.measuring}
            onClick={tools.onMeasure}
          />
          <IconButton
            glyph="search-area"
            label={t('A spell’s area')}
            aria-pressed={tools.laying}
            onClick={tools.onArea}
          />
        </>
      )}
      {paint && (
        <IconButton
          glyph="map"
          label={t('Paint the ground')}
          aria-pressed={paint.on}
          onClick={paint.onToggle}
        />
      )}
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
