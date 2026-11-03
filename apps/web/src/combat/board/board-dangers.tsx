import type { BoardHazard, BoardTrap } from '@ltw/contracts';

import { Glyph } from '../../visual/glyph.tsx';
import { trapState } from './dangers.ts';

/** Harmful ground and a trap on a square, as `dangers.ts` reads them (ADR 0057 §6). */
export function DangerMarks({
  trap,
  hazard,
}: {
  readonly trap: BoardTrap | undefined;
  readonly hazard: BoardHazard | undefined;
}) {
  return (
    <>
      {hazard && (
        <span className={`square-hazard square-hazard--${hazard.kind}`} aria-hidden="true" />
      )}
      {trap && (
        <>
          <span
            className={`square-trap-area square-trap-area--${trapState(trap)}`}
            aria-hidden="true"
          />
          <Glyph
            name={trapState(trap) === 'hidden' ? 'secret' : 'warning'}
            className={`square-trap square-trap--${trapState(trap)}`}
          />
        </>
      )}
    </>
  );
}
