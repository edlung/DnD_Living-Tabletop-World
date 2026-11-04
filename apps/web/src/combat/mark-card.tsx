import { useT } from '@ltw/ui';
import { useId, type Ref } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import type { Marks } from './use-marks.ts';

/**
 * The table's marks in hand (docs/adr/0057-encounters-maps-loot.md §5): a ping where a square is
 * pressed, the DM's pointer moved there, or a stroke drawn across the board — for every screen at
 * the table. The DM lets players mark, and clears every mark.
 */
export type MarkMode = 'ping' | 'pointer' | 'draw';

export function MarkCard({
  mode,
  dm,
  marks,
  panel,
  onMode,
  onClose,
}: {
  readonly mode: MarkMode;
  readonly dm: boolean;
  readonly marks: Marks;
  readonly panel: Ref<HTMLElement>;
  readonly onMode: (mode: MarkMode) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const modes: readonly MarkMode[] = dm ? ['ping', 'pointer', 'draw'] : ['ping', 'draw'];
  const words: Readonly<Record<MarkMode, string>> = {
    ping: 'Ping a square',
    pointer: 'Point at a square',
    draw: 'Draw on the board',
  };
  const count = marks.value?.marks.length ?? 0;
  return (
    <section
      ref={panel}
      className="combat-side-card board-tool-card"
      aria-labelledby={`${ids}-title`}
      tabIndex={-1}
    >
      <header className="side-header">
        <Glyph name="target" className="side-glyph" />
        <div className="side-title">
          <p className="eyebrow">{t('For the whole table')}</p>
          <h3 id={`${ids}-title`}>{t('Mark the board')}</h3>
        </div>
        <IconButton glyph="close" label={t('Put the tool away')} onClick={onClose} />
      </header>
      <fieldset className="paint-brushes">
        <legend>{t('Mark')}</legend>
        {modes.map((one) => (
          <div key={one} className="paint-brush">
            <input
              id={`${ids}-${one}`}
              type="radio"
              name={`${ids}-mode`}
              checked={mode === one}
              onChange={() => {
                onMode(one);
              }}
            />
            <label htmlFor={`${ids}-${one}`}>{t(words[one])}</label>
          </div>
        ))}
      </fieldset>
      <p className="muted">
        {mode === 'draw'
          ? t('Drag across the squares to draw; a press pings.')
          : t('Press a square: every screen at the table sees it.')}
      </p>
      {marks.failed && (
        <p className="authoring-notice error" role="alert">
          {t('The mark did not reach the table. Try again.')}
        </p>
      )}
      {dm && (
        <div className="mark-dm">
          <div className="paint-brush">
            <input
              id={`${ids}-allow`}
              type="checkbox"
              checked={marks.value?.playersMayMark ?? false}
              onChange={(event) => {
                marks.allow(event.target.checked);
              }}
            />
            <label htmlFor={`${ids}-allow`}>{t('Players may mark the board')}</label>
          </div>
          <button type="button" disabled={count === 0} onClick={marks.clear}>
            {t('Clear the marks ({count})', { count })}
          </button>
        </div>
      )}
      <div className="action-row">
        <button type="button" className="primary-button" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </section>
  );
}
