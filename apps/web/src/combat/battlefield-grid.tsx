import type { EncounterView, Square } from '@ltw/contracts';

import { squareLabel } from './combat-bindings.ts';

export const combatantLabel = (combatant: EncounterView['combatants'][number]): string =>
  combatant.entity.name ?? combatant.entity.entityId;

function tokenText(label: string): string {
  const words = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const digits = /\d+$/.exec(label)?.[0] ?? '';
  const letters = words
    .filter((word) => !/^\d+$/.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return `${letters}${digits}`;
}

const key = (square: Square) => `${String(square.x)},${String(square.y)}`;

/**
 * The persistent battlefield: squares, terrain, cover, and combatants exactly as
 * the server published them for this perspective. It draws; it never decides.
 */
export function BattlefieldGrid({
  encounter,
  selfId,
  selected,
  path,
  affected,
  onPick,
}: {
  readonly encounter: EncounterView;
  readonly selfId: string | null;
  readonly selected: Square | null;
  readonly path: readonly Square[];
  /** Combatants a previewed area spell would affect. */
  readonly affected: ReadonlySet<string>;
  readonly onPick: (square: Square) => void;
}) {
  const { width, height, difficult, cover } = encounter.battlefield;
  const hard = new Set(difficult.map(key));
  const coverAt = new Map(cover.map((entry) => [key(entry), entry.level]));
  const occupants = new Map(encounter.combatants.map((entry) => [key(entry.position), entry]));
  const walk = new Set(path.map(key));
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const square = { x, y };
      const id = key(square);
      const occupant = occupants.get(id);
      const notes = [
        occupant
          ? `${combatantLabel(occupant)}${occupant.entity.entityId === selfId ? ' (you)' : ''}, ${occupant.side}${occupant.state === 'up' ? '' : `, ${occupant.state}`}`
          : null,
        hard.has(id) ? 'difficult terrain' : null,
        coverAt.has(id) ? `${coverAt.get(id) ?? ''} cover` : null,
        occupant && affected.has(occupant.entity.entityId) ? 'in the area' : null,
      ].filter(Boolean);
      const classes = [
        'battle-cell',
        hard.has(id) ? 'is-difficult' : '',
        coverAt.has(id) ? `has-cover cover-${coverAt.get(id) ?? ''}` : '',
        walk.has(id) ? 'on-path' : '',
        selected && key(selected) === id ? 'is-selected' : '',
        occupant && affected.has(occupant.entity.entityId) ? 'in-area' : '',
        occupant?.entity.entityId === encounter.currentCombatantId ? 'has-turn' : '',
      ];
      cells.push(
        <button
          key={id}
          type="button"
          className={classes.filter(Boolean).join(' ')}
          aria-label={`Square ${squareLabel(square)}${notes.length ? `: ${notes.join('; ')}` : ''}`}
          aria-pressed={selected !== null && key(selected) === id}
          onClick={() => {
            onPick(square);
          }}
        >
          {occupant ? (
            <span
              className={`battle-token side-${occupant.side} state-${occupant.state}`}
              aria-hidden="true"
            >
              {tokenText(combatantLabel(occupant))}
            </span>
          ) : null}
        </button>,
      );
    }
  }
  return (
    <div
      className="battlefield-grid"
      role="group"
      aria-label="Battlefield"
      style={{ gridTemplateColumns: `repeat(${String(width)}, minmax(0, 1fr))` }}
    >
      {cells}
    </div>
  );
}
