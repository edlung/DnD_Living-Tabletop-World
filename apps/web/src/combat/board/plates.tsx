import type { EncounterView, Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { LabelOf } from '../labels.ts';
import { spanOf } from './footprint.ts';
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
 * are the controls. A flyer's height rides above its plate (docs/adr/0049-space-and-movement.md
 * §6), where no standing figure covers it.
 */
export function BoardPlates({
  encounter,
  layout,
  labelOf,
  onPick,
  onPoint,
  onPress,
}: {
  readonly encounter: Pick<EncounterView, 'combatants'>;
  readonly layout: BoardLayout;
  readonly labelOf: LabelOf;
  /** A press on a combatant's plate: its square is chosen. */
  readonly onPick: (square: Square) => void;
  /** The pointer came over (`true`) or left (`false`) the plate of the combatant on a square. */
  readonly onPoint: (square: Square, over: boolean) => void;
  /** A press on a plate that may become a drag of its combatant (the DM's hand, ADR 0057 §2). */
  readonly onPress?: (entityId: string, event: ReactPointerEvent) => void;
}) {
  const t = useT();
  const occupied = encounter.combatants.map((entry) => entry.position);
  return (
    <div className="board-plates" aria-hidden="true">
      {/* A rider's figure sits on its mount's: the mount's squares name it (ADR 0049 §10). */}
      {encounter.combatants
        .filter((combatant) => combatant.mountedOn === undefined)
        .map((combatant) => {
          // Under the middle of its space (docs/adr/0049-space-and-movement.md §1).
          const anchor = plateAnchor(layout, combatant.position, spanOf(combatant));
          const style: PlateStyle = {
            left: anchor.x,
            top: anchor.y,
            '--plate-scale': anchor.scale,
            '--plate-room': plateRoom(combatant.position, occupied),
          };
          return (
            <span
              key={combatant.entity.entityId}
              className={`board-plate board-plate--${anchor.edge} token--${combatant.side}${onPress ? ' is-draggable' : ''}`}
              style={style}
              onClick={() => {
                onPick(combatant.position);
              }}
              onPointerDown={(event) => {
                onPress?.(combatant.entity.entityId, event);
              }}
              onPointerEnter={() => {
                onPoint(combatant.position, true);
              }}
              onPointerLeave={() => {
                onPoint(combatant.position, false);
              }}
            >
              {(combatant.altitudeFt ?? 0) !== 0 && (
                <span className="plate-altitude">
                  {(combatant.altitudeFt ?? 0) > 0 ? '↑' : '↓'}{' '}
                  {t('{feet} ft', { feet: Math.abs(combatant.altitudeFt ?? 0) })}
                </span>
              )}
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
