import type { WeaponMastery } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import type { CombatUiCommand } from '../combat-bindings.ts';
import { masteryEffect } from '../weapon-words.ts';

/**
 * A mastery's choice before the attack (docs/adr/0047-weapons.md §2): how far Push moves the
 * creature it hits, or whether Topple tries to knock it down. The attack goes with the choice;
 * the World Engine rolls everything. The full use comes first.
 */
export function AttackChoice({
  mastery,
  command,
  locked,
  onRun,
  onCancel,
}: {
  readonly mastery: Extract<WeaponMastery, 'push' | 'topple'>;
  readonly command: Extract<CombatUiCommand, { type: 'Attack' }>;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const options =
    mastery === 'push'
      ? [
          { label: t('Push 10 ft'), change: { push: 10 as const } },
          { label: t('Push 5 ft'), change: { push: 5 as const } },
          { label: t('Do not push'), change: { push: 0 as const } },
        ]
      : [
          { label: t('Try to topple'), change: { topple: true } },
          { label: t('Do not topple'), change: { topple: false } },
        ];
  return (
    <div className="action-choice" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {t('On a hit')}
      </p>
      <small className="action-choice-note">{masteryEffect(t, mastery)}</small>
      <div className="action-row">
        {options.map((option, index) => (
          <button
            key={option.label}
            type="button"
            className={index === 0 ? 'primary-button' : undefined}
            disabled={locked}
            onClick={() => {
              onRun({ kind: 'command', command: { ...command, ...option.change } });
            }}
          >
            {option.label}
          </button>
        ))}
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
