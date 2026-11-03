import {
  fogBattlefield,
  paintBattlefield,
  type Battlefield,
  type EncounterCombatantView,
  type Square,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useRef, useState } from 'react';

import { Board } from './board/board.tsx';
import { useBoardView } from './board/board-view.ts';
import { spaceOf, type LaidToken } from './encounter-layout.ts';
import { PaintCard, type Brush } from './paint-card.tsx';

/**
 * The builder's battlefield (docs/adr/0057-encounters-maps-loot.md §1–2): the foes and the
 * party's places where they will start, on the ground the DM paints before the fight with the
 * brush of the fight itself; a foe or a place moved by choosing it and then a square, or by
 * dragging it. Nothing here is the world's until the encounter starts.
 */
const NO_AREA: ReadonlySet<string> = new Set();

export function EncounterField({
  ground,
  tokens,
  onGround,
  onMove,
}: {
  readonly ground: Battlefield;
  readonly tokens: readonly LaidToken[];
  readonly onGround: (ground: Battlefield) => void;
  readonly onMove: (key: string, square: Square) => void;
}) {
  const t = useT();
  const ids = useId();
  // Flat from above, as an editor is: every square exactly where it is drawn.
  const view = useBoardView('flat');
  const panel = useRef<HTMLElement>(null);
  const [painting, setPainting] = useState(false);
  const [brush, setBrush] = useState<Brush>({ kind: 'wall' });
  // The token chosen to move, and the square last chosen.
  const [held, setHeld] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const combatants: EncounterCombatantView[] = tokens.map((token) => ({
    entity: {
      entityId: token.key,
      kind: token.side === 'party' ? 'character' : 'creature',
      name: token.name,
    },
    side: token.side,
    position: token.position,
    ...(token.size === 'medium' ? {} : { size: token.size }),
    state: 'up',
    conditions: [],
  }));
  const names = new Map(tokens.map((token) => [token.key, token.name]));
  const at = (square: Square) =>
    tokens.find((token) => spaceOf(token).some((one) => one.x === square.x && one.y === square.y));
  const pick = (square: Square) => {
    const token = at(square);
    if (token) {
      setHeld(token.key);
      setSelected(token.position);
    } else if (held !== null) {
      onMove(held, square);
      setHeld(null);
      setSelected(null);
    } else {
      setSelected(square);
    }
  };
  const holding = held === null ? null : (names.get(held) ?? null);
  return (
    <section className="encounter-field" aria-labelledby={`${ids}-title`}>
      <h6 id={`${ids}-title`}>{t('The battlefield')}</h6>
      <p className="muted" role="status">
        {holding
          ? t('Choose a square for {name}, or drag it there.', { name: holding })
          : t('Choose a foe or a party place, then a square — or drag it there.')}
      </p>
      <div className="encounter-field-board">
        <Board
          encounter={{ battlefield: ground, combatants }}
          labelOf={(id) => names.get(id) ?? ''}
          selfId={null}
          selected={selected}
          path={[]}
          affected={NO_AREA}
          imageOf={() => null}
          figureOf={() => null}
          battleMap={null}
          view={view}
          fogView="veil"
          onPick={pick}
          onDropToken={(key, square) => {
            setHeld(null);
            setSelected(null);
            onMove(key, square);
          }}
          paint={{
            on: painting,
            onToggle: () => {
              setHeld(null);
              setPainting((on) => !on);
            },
            onStroke: (squares) => {
              onGround(
                brush.kind === 'fog'
                  ? fogBattlefield(ground, squares, brush.hidden)
                  : paintBattlefield(ground, squares, brush),
              );
            },
          }}
        />
      </div>
      {painting && (
        <PaintCard
          brush={brush}
          locked={false}
          panel={panel}
          onBrush={setBrush}
          onClose={() => {
            setPainting(false);
          }}
        />
      )}
    </section>
  );
}
