import type { EncounterView, PlayerAssetView, Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { BoardControls } from './board-controls.tsx';
import type { BoardView } from './board-view.ts';
import {
  boardLayout,
  fitCell,
  planeTransform,
  projectPoint,
  squareCenter,
  TILT,
  uprightTransform,
  type Size,
} from './geometry.ts';
import { useScrollEdges } from '../../visual/scroll-edges.ts';
import type { LabelOf } from '../labels.ts';
import { BoardGround } from './board-ground.tsx';
import { BoardPlates } from './plates.tsx';
import { squareName } from './square-name.ts';
import { TerrainCard } from './terrain-card.tsx';
import { CoverPiece, Token } from './token.tsx';

const key = (square: { readonly x: number; readonly y: number }) =>
  `${String(square.x)},${String(square.y)}`;

/** The space the board is given, as laid out by the stylesheet for this width. */
function useSpace(): [React.RefObject<HTMLDivElement | null>, Size | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSpace((known) =>
        known?.width === width && known.height === height ? known : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, space];
}

type StageStyle = CSSProperties & {
  readonly '--cell': string;
  readonly '--plane-transform': string;
  readonly '--upright-transform': string;
};

/**
 * The battlefield as a painted table (docs/STAGE_320_DESIGN.md §5.5, ADR 0034 §6–7): the place's
 * approved battle map or else the GPT ground, the difficult patch on difficult squares,
 * hairlines, the movement path and the previewed area, cover pieces, then the combatants as
 * their approved figures or medallions, and above them all their name plates — every square,
 * cover level, position and state from the encounter's projection, nothing inferred. Tilted, the
 * plane turns away like a table seen at an angle while figures and pieces stand upright; flat, it
 * is seen from above. Either way each square is the same button, in the same order, with the
 * same name.
 */
export function Board({
  encounter,
  labelOf,
  currentCombatantId = null,
  selfId,
  selected,
  path,
  affected,
  imageOf,
  figureOf,
  battleMap,
  view,
  onPick,
  centreOn = null,
}: {
  readonly encounter: Pick<EncounterView, 'battlefield' | 'combatants'>;
  readonly labelOf: LabelOf;
  /** Only a live encounter has an active turn; prepared layouts omit it. */
  readonly currentCombatantId?: string | null;
  readonly selfId: string | null;
  readonly selected: Square | null;
  /** The advisory route to the selected square, without the mover's own square. */
  readonly path: readonly Square[];
  /** Combatants a previewed area spell would affect, as the server listed them. */
  readonly affected: ReadonlySet<string>;
  readonly imageOf: (entityId: string) => PlayerAssetView | null;
  /** A combatant's approved tabletop figure (ADR 0035 §4), when the place's presentation has it. */
  readonly figureOf: (entityId: string) => PlayerAssetView | null;
  /** The encounter's place's approved battle map: the ground under the grid when there is one. */
  readonly battleMap: PlayerAssetView | null;
  readonly view: BoardView;
  readonly onPick: (square: Square) => void;
  /** A square to keep in view when the board scrolls (the table's screen follows the fight). */
  readonly centreOn?: Square | null;
}) {
  const t = useT();
  const [area, space] = useSpace();
  const viewport = useRef<HTMLDivElement>(null);
  // The square the pointer is over and the one keyboard focus is on: the terrain card reads it.
  const [pointed, setPointed] = useState<Square | null>(null);
  const [focused, setFocused] = useState<Square | null>(null);
  const { width, height, difficult, cover } = encounter.battlefield;
  const grid = { width, height };
  const tilt = view.mode === 'tilted' ? TILT : null;
  const fitted = space
    ? fitCell(space, grid, tilt, { min: view.narrow ? 36 : 24, max: view.maxCell ?? 72 })
    : 40;
  const cell = Math.round(fitted * view.zoom);
  const layout = boardLayout(grid, cell, tilt);
  const hard = new Set(difficult.map(key));
  const coverAt = new Map(cover.map((entry) => [key(entry), entry.level]));
  const occupants = new Map(encounter.combatants.map((entry) => [key(entry.position), entry]));
  const walk = new Set(path.map(key));
  const destination = path.at(-1);
  const mover = encounter.combatants.find((entry) => entry.entity.entityId === selfId);
  // The pointer over a square, or over the plate of the combatant standing on it (`plates.tsx`).
  const point = (square: Square, over: boolean) => {
    if (over) setPointed(square);
    else setPointed((known) => (known && key(known) === key(square) ? null : known));
  };

  // On a phone the board scrolls: bring the chosen square, else the viewer, else whoever acts
  // into view when it first shows and whenever its scale or view changes. Only a new scale or
  // view recentres (the effect reads that render's squares); a choice never moves the board
  // under the pointer. A square to keep in view (the table's screen) recentres when it moves.
  const centreKey = centreOn ? key(centreOn) : '';
  useEffect(() => {
    const element = viewport.current;
    const target =
      centreOn ??
      selected ??
      mover?.position ??
      encounter.combatants.find((entry) => entry.entity.entityId === currentCombatantId)?.position;
    if (!element || !target) return;
    if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)
      return;
    const point = projectPoint(layout, squareCenter(target, cell));
    element.scrollLeft = point.x - element.clientWidth / 2;
    element.scrollTop = point.y - element.clientHeight / 2;
  }, [cell, view.mode, centreKey]);
  // Where the board hides more beyond a side edge, that edge fades (a cut reads as the end).
  const edges = useScrollEdges(viewport, `${String(cell)}:${view.mode}`);

  const stage: StageStyle = {
    width: layout.box.width,
    height: layout.box.height,
    '--cell': `${String(cell)}px`,
    '--plane-transform': planeTransform(tilt),
    '--upright-transform': uprightTransform(tilt),
    ...(layout.origin
      ? {
          perspective: `${String(TILT.perspective)}px`,
          perspectiveOrigin: `${String(layout.origin.x)}px ${String(layout.origin.y)}px`,
        }
      : {}),
  };
  const squares: React.ReactNode[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const square = { x, y };
      const id = key(square);
      const occupant = occupants.get(id) ?? null;
      const level = coverAt.get(id) ?? null;
      const isSelected = selected !== null && key(selected) === id;
      const inArea = occupant !== null && affected.has(occupant.entity.entityId);
      const classes = [
        'board-square',
        hard.has(id) ? 'is-difficult' : '',
        level ? 'has-cover' : '',
        level && occupant ? 'has-occupant' : '',
        walk.has(id) ? 'on-path' : '',
        destination && key(destination) === id ? 'is-destination' : '',
        inArea ? 'in-area' : '',
        isSelected ? 'is-selected' : '',
        // Lit as under the pointer while the pointer is on its combatant's plate, too.
        pointed !== null && key(pointed) === id ? 'is-pointed' : '',
      ];
      squares.push(
        <button
          key={id}
          type="button"
          className={classes.filter(Boolean).join(' ')}
          style={{ '--x': x, '--y': y } as CSSProperties}
          aria-label={squareName(t, square, {
            occupant,
            label: occupant ? labelOf(occupant.entity.entityId) : '',
            you: occupant !== null && occupant.entity.entityId === selfId,
            difficult: hard.has(id),
            cover: level,
            inArea,
          })}
          aria-pressed={isSelected}
          onClick={() => {
            onPick(square);
          }}
          onPointerEnter={() => {
            point(square, true);
          }}
          onPointerLeave={() => {
            point(square, false);
          }}
          onFocus={() => {
            setFocused(square);
          }}
          onBlur={() => {
            setFocused((known) => (known && key(known) === id ? null : known));
          }}
        >
          {level && <CoverPiece level={level} />}
          {occupant && (
            <Token
              combatant={occupant}
              label={labelOf(occupant.entity.entityId)}
              cover={level}
              image={imageOf(occupant.entity.entityId)}
              figure={figureOf(occupant.entity.entityId)}
              tilted={tilt !== null}
              current={occupant.entity.entityId === currentCombatantId}
              selected={isSelected}
              inArea={inArea}
            />
          )}
        </button>,
      );
    }
  }
  const route = mover && path.length > 0 ? [mover.position, ...path] : [];
  const looked = pointed ?? focused ?? selected;
  return (
    <div className={`board board--${view.mode}`} ref={area}>
      <BoardControls view={view} />
      {looked && (
        <TerrainCard
          square={looked}
          cover={coverAt.get(key(looked)) ?? null}
          difficult={hard.has(key(looked))}
        />
      )}
      <div
        className="board-viewport"
        ref={viewport}
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
      >
        <div className="board-stage" style={stage}>
          <div
            className="board-plane"
            role="group"
            aria-label={t('Battlefield')}
            style={{
              top: layout.planeTop,
              width: layout.plane.width,
              height: layout.plane.height,
              gridTemplateColumns: `repeat(${String(width)}, var(--cell))`,
            }}
          >
            <BoardGround map={battleMap} />
            {squares}
            {route.length > 1 && (
              <svg
                className="board-path"
                aria-hidden="true"
                viewBox={`0 0 ${String(layout.plane.width)} ${String(layout.plane.height)}`}
              >
                <polyline
                  points={route
                    .map((square) => {
                      const point = squareCenter(square, cell);
                      return `${String(point.x)},${String(point.y)}`;
                    })
                    .join(' ')}
                />
              </svg>
            )}
          </div>
          <BoardPlates
            encounter={encounter}
            layout={layout}
            labelOf={labelOf}
            onPick={onPick}
            onPoint={point}
          />
        </div>
      </div>
    </div>
  );
}
