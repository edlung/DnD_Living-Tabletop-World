import type { EncounterView } from '@ltw/contracts';
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
 * no wider than the room beside it (`plateRoom`). Decorative: every square's name carries the
 * label, and the layer lets every press through to the squares.
 */
export function BoardPlates({
  encounter,
  layout,
  labelOf,
}: {
  readonly encounter: EncounterView;
  readonly layout: BoardLayout;
  readonly labelOf: LabelOf;
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
