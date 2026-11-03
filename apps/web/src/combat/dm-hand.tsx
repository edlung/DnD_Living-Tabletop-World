import type { EncounterView, Square } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import type { Ref } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { Glyph } from '../visual/glyph.tsx';
import type { LabelOf } from './labels.ts';
import { occupantAt, type MoveOption } from './move-options.ts';
import { moveLabel } from './move-words.ts';

/**
 * The DM's hand on the board (docs/adr/0057-encounters-maps-loot.md §2): with a combatant chosen,
 * a square chosen next sets it down there — no movement spent, no opportunity attack — and on a
 * creature's own turn the ways to it move it as its rules allow. A token dragged to a square does
 * the same as "Set it down here". The World Engine decides each.
 */
export function DmSquareCard({
  encounter,
  square,
  held,
  moves,
  labelOf,
  locked,
  panel,
  onRun,
  onClose,
}: {
  readonly encounter: EncounterView;
  readonly square: Square;
  /** The combatant the DM chose last, if any. */
  readonly held: string | null;
  /** On the held creature's own turn, the ways to the square. */
  readonly moves: readonly MoveOption[];
  readonly labelOf: LabelOf;
  readonly locked: boolean;
  readonly panel: Ref<HTMLElement>;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const combatant = encounter.combatants.find((one) => one.entity.entityId === held) ?? null;
  const name = combatant ? labelOf(combatant.entity.entityId) : '';
  // Set down here a moment ago, or by another hand: the square says who stands on it now.
  const standing = occupantAt(encounter, square);
  return (
    <section
      ref={panel}
      className="combat-side-card move-card dm-square-card"
      aria-label={t('Square {x}, {y}', { x: square.x, y: square.y })}
      tabIndex={-1}
    >
      <header className="side-header">
        <Glyph name="move" className="side-glyph" />
        <div className="side-title">
          <p className="eyebrow">{t('The DM’s hand')}</p>
          <h3>{t('Square {x}, {y}', { x: square.x, y: square.y })}</h3>
        </div>
        <IconButton glyph="close" label={t('Close options')} onClick={onClose} />
      </header>
      {standing ? (
        <p className="muted" role="status">
          {t('{name} stands here.', { name: labelOf(standing.entity.entityId) })}
        </p>
      ) : combatant === null ? (
        <p className="muted">
          {t('Choose a combatant, then a square to set it down on — or drag its token there.')}
        </p>
      ) : (
        <div className="action-row">
          {moves.map((option) => (
            <button
              key={option.kind}
              type="button"
              disabled={locked}
              onClick={() => {
                onRun({
                  kind: 'command',
                  command: {
                    type: 'MoveCombatant',
                    combatantId: combatant.entity.entityId,
                    path: [...option.path],
                    ...(option.crawl ? { crawl: true } : {}),
                  },
                });
              }}
            >
              {moveLabel(t, option)}
            </button>
          ))}
          <button
            type="button"
            className={moves.length === 0 ? 'primary-button' : undefined}
            disabled={locked}
            onClick={() => {
              onRun({
                kind: 'command',
                command: {
                  type: 'PlaceCombatant',
                  combatantId: combatant.entity.entityId,
                  position: { x: square.x, y: square.y },
                },
              });
            }}
          >
            {t('Set {name} down here', { name })}
          </button>
        </div>
      )}
      {combatant !== null && !standing && (
        <p className="muted">
          {t('Setting it down spends no movement and provokes no opportunity attack.')}
        </p>
      )}
    </section>
  );
}
