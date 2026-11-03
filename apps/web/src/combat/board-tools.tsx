import {
  squareDistanceFt,
  squaresInArea,
  type EncounterView,
  type Square,
  type SpellArea,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, type Ref } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';

/**
 * The viewer's own tools on the board (docs/adr/0057-encounters-maps-loot.md §5): a ruler that
 * counts as the rules do (every square 5 feet, diagonals too) and a spell's area laid to see the
 * squares it covers, with the rules' own geometry. Nothing here is the world's or the table's: each
 * screen measures for itself.
 */
export type AreaShape = 'sphere' | 'cube' | 'cone' | 'line' | 'emanation';
export interface AreaSpec {
  readonly shape: AreaShape;
  readonly sizeFt: number;
  readonly widthFt: number;
}
export type Tool =
  | { readonly kind: 'measure'; readonly from: Square | null; readonly to: Square | null }
  | { readonly kind: 'area'; readonly spec: AreaSpec; readonly toward: Square | null }
  | null;

const SHAPES: readonly AreaShape[] = ['sphere', 'cube', 'cone', 'line', 'emanation'];
const SHAPE_WORDS: Readonly<Record<AreaShape, string>> = {
  sphere: 'Sphere, at a point',
  cube: 'Cube, at a point',
  cone: 'Cone, from the caster',
  line: 'Line, from the caster',
  emanation: 'Emanation, around the caster',
};
const SIZES = [5, 10, 15, 20, 30, 40, 60, 90, 120] as const;
const key = (square: Square) => `${String(square.x)},${String(square.y)}`;

export const DEFAULT_AREA: AreaSpec = { shape: 'sphere', sizeFt: 20, widthFt: 5 };

/** The rules' area for a laid template: a sphere or cube at its point, the rest from the caster. */
export const areaOf = (spec: AreaSpec): SpellArea => ({
  shape: spec.shape,
  sizeFt: spec.sizeFt,
  widthFt: spec.shape === 'line' ? spec.widthFt : null,
  origin: spec.shape === 'sphere' || spec.shape === 'cube' ? 'point' : 'self',
});

/** The squares a laid template covers, as the board marks them. */
export function templateSquares(
  tool: Tool,
  caster: readonly Square[],
  field: EncounterView['battlefield'],
): ReadonlySet<string> | undefined {
  if (tool?.kind !== 'area') return undefined;
  const area = areaOf(tool.spec);
  if (area.origin === 'self' && caster.length === 0) return new Set();
  if (area.origin === 'point' && tool.toward === null) return new Set();
  return new Set(squaresInArea(area, caster, tool.toward, field).map(key));
}

export function ToolCard({
  tool,
  covered,
  hasCaster,
  panel,
  onTool,
  onClose,
}: {
  readonly tool: Exclude<Tool, null>;
  /** How many squares the laid area covers. */
  readonly covered: number;
  /** Whether a caster stands on the board for an area sent from one. */
  readonly hasCaster: boolean;
  readonly panel: Ref<HTMLElement>;
  readonly onTool: (tool: Tool) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const ids = useId();
  const title = tool.kind === 'measure' ? t('Measure') : t('A spell’s area');
  return (
    <section
      ref={panel}
      className="combat-side-card board-tool-card"
      aria-labelledby={`${ids}-title`}
      tabIndex={-1}
    >
      <header className="side-header">
        <Glyph name={tool.kind === 'measure' ? 'speed' : 'search-area'} className="side-glyph" />
        <div className="side-title">
          <p className="eyebrow">{t('On your board only')}</p>
          <h3 id={`${ids}-title`}>{title}</h3>
        </div>
        <IconButton glyph="close" label={t('Put the tool away')} onClick={onClose} />
      </header>
      {tool.kind === 'measure' ? (
        <>
          <p className="muted">
            {t(
              'Press where the ruler starts, then where it ends. Every square is 5 ft, diagonals too.',
            )}
          </p>
          <p className="tool-reading" role="status">
            {tool.from && tool.to
              ? t('{feet} ft', { feet: squareDistanceFt(tool.from, tool.to) })
              : tool.from
                ? t('Now press where it ends.')
                : t('Press where it starts.')}
          </p>
        </>
      ) : (
        <>
          <fieldset className="paint-brushes">
            <legend>{t('Shape')}</legend>
            {SHAPES.map((shape) => (
              <div key={shape} className="paint-brush">
                <input
                  id={`${ids}-${shape}`}
                  type="radio"
                  name={`${ids}-shape`}
                  checked={tool.spec.shape === shape}
                  onChange={() => {
                    onTool({ ...tool, spec: { ...tool.spec, shape } });
                  }}
                />
                <label htmlFor={`${ids}-${shape}`}>{t(SHAPE_WORDS[shape])}</label>
              </div>
            ))}
          </fieldset>
          <div className="builder-fields">
            <div className="account-field">
              <label htmlFor={`${ids}-size`}>
                {tool.spec.shape === 'sphere' || tool.spec.shape === 'emanation'
                  ? t('Radius')
                  : t('Size')}
              </label>
              <select
                id={`${ids}-size`}
                value={tool.spec.sizeFt}
                onChange={(event) => {
                  onTool({ ...tool, spec: { ...tool.spec, sizeFt: Number(event.target.value) } });
                }}
              >
                {SIZES.map((feet) => (
                  <option key={feet} value={feet}>
                    {t('{feet} ft', { feet })}
                  </option>
                ))}
              </select>
            </div>
            {tool.spec.shape === 'line' && (
              <div className="account-field">
                <label htmlFor={`${ids}-width`}>{t('Width')}</label>
                <select
                  id={`${ids}-width`}
                  value={tool.spec.widthFt}
                  onChange={(event) => {
                    onTool({
                      ...tool,
                      spec: { ...tool.spec, widthFt: Number(event.target.value) },
                    });
                  }}
                >
                  {[5, 10].map((feet) => (
                    <option key={feet} value={feet}>
                      {t('{feet} ft', { feet })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="tool-reading" role="status">
            {areaOf(tool.spec).origin === 'self' && !hasCaster
              ? t('Choose the caster on the board first: the area goes out from them.')
              : tool.toward === null
                ? t('Press the square it points at.')
                : t('It covers {count} squares.', { count: covered })}
          </p>
        </>
      )}
      <div className="action-row">
        <button type="button" className="primary-button" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </section>
  );
}
