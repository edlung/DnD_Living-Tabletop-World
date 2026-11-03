import type { Square, TerrainPaint } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState, type Dispatch, type Ref, type SetStateAction } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { paintName } from './terrain-words.ts';

/**
 * The DM's brush (docs/adr/0057-encounters-maps-loot.md §2): what a press or a stroke across the
 * board lays — a wall, difficult ground, cover, water, a height, obscurement — or clears. The World
 * Engine decides each stroke; a wall never rises where someone stands.
 */
const BRUSHES: readonly TerrainPaint[] = [
  { kind: 'wall' },
  { kind: 'difficult' },
  { kind: 'cover', level: 'half' },
  { kind: 'cover', level: 'three-quarters' },
  { kind: 'cover', level: 'total' },
  { kind: 'water', deep: false },
  { kind: 'water', deep: true },
  { kind: 'ground', ft: 10 },
  { kind: 'obscured', heavy: false },
  { kind: 'obscured', heavy: true },
  { kind: 'clear' },
];
/**
 * The brush in the DM's hand: on or off, what it lays, and the square it touched last. It lives
 * with the combat stage, so it outlasts the battlefield starting afresh after each own action
 * (each stroke is one), and the keyboard finds its place again there.
 */
export interface BrushState {
  readonly painting: boolean;
  readonly brush: TerrainPaint;
  readonly last: Square | null;
}
export type BrushHand = readonly [BrushState, Dispatch<SetStateAction<BrushState>>];

export function useBrush(): BrushHand {
  return useState<BrushState>({ painting: false, brush: { kind: 'wall' }, last: null });
}

/** The heights a brush lays, highest first: a ledge to a pit. */
const HEIGHTS = [30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30] as const;

/** One brush's place in the list: a height is one brush whatever its feet. */
const brushKey = (paint: TerrainPaint) =>
  paint.kind === 'cover'
    ? `cover-${paint.level}`
    : paint.kind === 'water'
      ? `water-${paint.deep ? 'deep' : 'shallow'}`
      : paint.kind === 'obscured'
        ? `obscured-${paint.heavy ? 'heavy' : 'light'}`
        : paint.kind;

export function PaintCard({
  brush,
  locked,
  panel,
  onBrush,
  onClose,
}: {
  readonly brush: TerrainPaint;
  readonly locked: boolean;
  readonly panel: Ref<HTMLElement>;
  readonly onBrush: (brush: TerrainPaint) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const height = brush.kind === 'ground' ? brush.ft : 10;
  return (
    <section
      ref={panel}
      className="combat-side-card paint-card"
      aria-labelledby={`${ids}-title`}
      tabIndex={-1}
    >
      <header className="side-header">
        <Glyph name="map" className="side-glyph" />
        <div className="side-title">
          <p className="eyebrow">{t('The DM’s hand')}</p>
          <h3 id={`${ids}-title`}>{t('Paint the ground')}</h3>
        </div>
        <IconButton glyph="close" label={t('Done painting')} onClick={onClose} />
      </header>
      <p className="muted">{t('Choose a brush, then press a square or drag across several.')}</p>
      <fieldset className="paint-brushes" disabled={locked}>
        <legend>{t('Brush')}</legend>
        {BRUSHES.map((option) => {
          const id = `${ids}-${brushKey(option)}`;
          const chosen = brushKey(option) === brushKey(brush);
          return (
            <div key={id} className="paint-brush">
              <input
                id={id}
                type="radio"
                name={`${ids}-brush`}
                checked={chosen}
                onChange={() => {
                  onBrush(option.kind === 'ground' ? { kind: 'ground', ft: height } : option);
                }}
              />
              <label htmlFor={id}>
                {option.kind === 'ground' ? t('Height') : paintName(t, option)}
              </label>
              {option.kind === 'ground' && (
                <select
                  aria-label={t('Height')}
                  value={height}
                  onChange={(event) => {
                    onBrush({ kind: 'ground', ft: Number(event.target.value) });
                  }}
                >
                  {HEIGHTS.map((ft) => (
                    <option key={ft} value={ft}>
                      {paintName(t, { kind: 'ground', ft })}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </fieldset>
      <div className="action-row">
        <button type="button" className="primary-button" onClick={onClose}>
          {t('Done painting')}
        </button>
      </div>
    </section>
  );
}
