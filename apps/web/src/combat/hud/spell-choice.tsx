import type { ContextSpell } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { castSpellCommand } from '../combat-bindings.ts';

/**
 * A spell's slot, asked in the turn tray when more than one could pay for it
 * (docs/adr/0052-spells-as-data.md §3): the lowest first; a higher one adds what the spell names.
 * The World Engine judges the cast again and rolls everything.
 */
export function SpellChoice({
  spell,
  actorId,
  target,
  locked,
  onRun,
  onCancel,
}: {
  readonly spell: ContextSpell;
  readonly actorId: string;
  readonly target: { readonly entityId: string; readonly position: { x: number; y: number } };
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <div className="action-choice" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {t('{spell}: which slot?', { spell: t(spell.name) })}
      </p>
      <small className="action-choice-note">
        {spell.perSlot
          ? t('Each level above {level} adds {count} more.', {
              level: spell.level,
              count: spell.perSlot,
            })
          : t('A higher slot adds what the spell says for it.')}
      </small>
      <div className="action-row">
        {spell.slots.map((slotLevel, index) => (
          <button
            key={slotLevel}
            type="button"
            className={index === 0 ? 'primary-button' : undefined}
            disabled={locked}
            onClick={() => {
              onRun({
                kind: 'command',
                command: castSpellCommand(spell, actorId, target, { slotLevel }),
              });
            }}
          >
            {t('Level {level} slot', { level: slotLevel })}
          </button>
        ))}
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
