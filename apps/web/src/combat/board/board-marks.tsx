import { PING_MS } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useState } from 'react';

import type { ShownMark } from '../use-marks.ts';
import { squareCenter, type BoardLayout } from './geometry.ts';

/**
 * The table's shared marks drawn on the board (docs/adr/0057-encounters-maps-loot.md §5): a ping
 * as a ring that fades, the DM's pointer as a pin, a stroke through the squares it crossed, a laid
 * area as its squares outlined — the DM's in gold, a player's in the party's colour. The drawing
 * is decorative for assistive technology: the newest mark is said once as it arrives, and a
 * square's name says when the DM points at it.
 */
export function BoardMarks({
  marks,
  cell,
  layout,
}: {
  readonly marks: readonly ShownMark[];
  readonly cell: number;
  readonly layout: BoardLayout;
}) {
  const news = useMarkNews(marks);
  const now = useNow(marks.some((mark) => mark.kind === 'ping'));
  const shown = marks.filter(
    (mark) => mark.kind !== 'ping' || (mark.seenAt ?? now) + PING_MS > now,
  );
  const centre = (square: { readonly x: number; readonly y: number }) => squareCenter(square, cell);
  return (
    <>
      {shown.length > 0 && (
        <svg
          className="board-marks"
          aria-hidden="true"
          viewBox={`0 0 ${String(layout.plane.width)} ${String(layout.plane.height)}`}
        >
          {shown.map((mark) => {
            const tone = `mark--${mark.by}`;
            if (mark.kind === 'stroke' && mark.squares) {
              return (
                <polyline
                  key={mark.markId}
                  className={`mark-stroke ${tone}`}
                  points={mark.squares
                    .map((square) => `${String(centre(square).x)},${String(centre(square).y)}`)
                    .join(' ')}
                />
              );
            }
            if (mark.kind === 'area' && mark.squares) {
              return (
                <g key={mark.markId} className={`mark-area ${tone}`}>
                  {mark.squares.map((square) => (
                    <rect
                      key={`${String(square.x)},${String(square.y)}`}
                      x={square.x * cell + 2}
                      y={square.y * cell + 2}
                      width={cell - 4}
                      height={cell - 4}
                    />
                  ))}
                </g>
              );
            }
            if (!mark.square) return null;
            const at = centre(mark.square);
            return mark.kind === 'pointer' ? (
              <g key={mark.markId} className={`mark-pointer ${tone}`}>
                <circle cx={at.x} cy={at.y} r={cell * 0.42} />
                <circle className="mark-pointer-dot" cx={at.x} cy={at.y} r={cell * 0.12} />
              </g>
            ) : (
              <circle
                key={mark.markId}
                className={`mark-ping ${tone}`}
                cx={at.x}
                cy={at.y}
                r={cell * 0.45}
              />
            );
          })}
        </svg>
      )}
      <p className="visually-hidden" role="status">
        {news}
      </p>
    </>
  );
}

const NEWS: Readonly<Record<ShownMark['kind'], Readonly<Record<ShownMark['by'], string>>>> = {
  ping: { dm: 'The DM pings: {square}', player: 'A player pings: {square}' },
  pointer: { dm: 'The DM points: {square}', player: 'The DM points: {square}' },
  stroke: { dm: 'The DM draws on the board', player: 'A player draws on the board' },
  area: { dm: 'The DM shows an area on the board', player: 'A player shows an area on the board' },
};

/** The newest mark in words, once, as it arrives; the marks standing as the board opens are not. */
function useMarkNews(marks: readonly ShownMark[]): string {
  const t = useT();
  const newest = marks.reduce<ShownMark | null>(
    (last, mark) => (last && last.createdAt >= mark.createdAt ? last : mark),
    null,
  );
  const [news, setNews] = useState(() => ({ at: newest?.createdAt ?? '', words: '' }));
  if (newest && newest.createdAt > news.at) {
    const square = newest.square ? t('Square {x}, {y}', { ...newest.square }) : '';
    setNews({ at: newest.createdAt, words: t(NEWS[newest.kind][newest.by], { square }) });
  }
  return news.words;
}

/** The time, ticking each half second while a ping may fade. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [ticking]);
  return now;
}
