import type { EncounterView, Square } from '@ltw/contracts';
import type { CSSProperties } from 'react';

import type { LabelOf } from '../labels.ts';
import { plateAnchor, plateRoom, type BoardLayout } from './geometry.ts';
import { TokenPlate } from './token.tsx';

type PlateStyle = CSSProperties & {
  readonly '--plate-scale': number;
  readonly '--plate-room': number;
};

/**
 * The combatants' name plates in a layer of their own, above every figure and cover piece
 * (design §5.5; the Stage 330 part B review): a figure standing nearly two squares tall in front
 * never hides the plate — or the number — of the combatant behind it, tilted or flat. Each plate
 * lies where it lay inside its token (`plateAnchor`), scaled like the figure standing there, and
 * no wider than the room beside it (`plateRoom`). A plate is part of its figure (design §5.5:
 * the same hit-testing in both views): pointing at it is pointing at its combatant's square — a
 * press chooses that square, as a press on the figure does, and the terrain card reads it —
 * never at the figure or square it is drawn over. Elsewhere the layer lets every press through.
 * Decorative for assistive technology: every square's name carries the label, and the squares
 * are the controls.
 */
export function BoardPlates({
  encounter,
  layout,
  labelOf,
  onPick,
  onPoint,
}: {
  readonly encounter: Pick<EncounterView, 'combatants'>;
  readonly layout: BoardLayout;
  readonly labelOf: LabelOf;
  /** A press on a combatant's plate: its square is chosen. */
  readonly onPick: (square: Square) => void;
  /** The pointer came over (`true`) or left (`false`) the plate of the combatant on a square. */
  readonly onPoint: (square: Square, over: boolean) => void;
}) {
  const occupied = encounter.combatants.map((entry) => entry.position);
  return (
    <div className="board-plates" aria-hidden="true">
      {encounter.combatants.map((combatant) => {
        const anchor = plateAnchor(layout, combatant.position);
        const style: PlateStyle = {
          left: anchor.x,
          top: anchor.y,
          '--plate-scale': anchor.scale,
          '--plate-room': plateRoom(combatant.position, occupied),
        };
        return (
          <span
            key={combatant.entity.entityId}
            className={`board-plate board-plate--${anchor.edge} token--${combatant.side}`}
            style={style}
            onClick={() => {
              onPick(combatant.position);
            }}
            onPointerEnter={() => {
              onPoint(combatant.position, true);
            }}
            onPointerLeave={() => {
              onPoint(combatant.position, false);
            }}
          >
            <TokenPlate
              label={labelOf(combatant.entity.entityId)}
              hitPoints={combatant.hitPoints}
            />
          </span>
        );
      })}
    </div>
  );
}
