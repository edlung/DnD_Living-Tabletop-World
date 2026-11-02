import type { WeaponMastery } from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useId } from 'react';

import type { ExplorationIntent } from '../../exploration/use-action.ts';
import type { CombatUiCommand } from '../combat-bindings.ts';
import { masteryEffect } from '../weapon-words.ts';

type AttackCommand = Extract<CombatUiCommand, { type: 'Attack' }>;

/** One way to make the attack: its words and what it changes of the command. */
export interface AttackOption {
  readonly label: string;
  readonly change: Partial<AttackCommand>;
}

/** What an attack asks before it is made: its title, a line of what it does, its ways. */
export interface AttackQuestion {
  readonly title: string;
  readonly note: string;
  readonly options: readonly AttackOption[];
}

/** Push's feet or Topple's try, asked before the roll (docs/adr/0047-weapons.md §2). */
export function masteryQuestion(
  t: Translate,
  mastery: Extract<WeaponMastery, 'push' | 'topple'>,
): AttackQuestion {
  return {
    title: t('On a hit'),
    note: masteryEffect(t, mastery),
    options:
      mastery === 'push'
        ? [
            { label: t('Push 10 ft'), change: { push: 10 } },
            { label: t('Push 5 ft'), change: { push: 5 } },
            { label: t('Do not push'), change: { push: 0 } },
          ]
        : [
            { label: t('Try to topple'), change: { topple: true } },
            { label: t('Do not topple'), change: { topple: false } },
          ],
  };
}

/** What a strike without a weapon does (docs/adr/0047-weapons.md §3, §6). */
export function unarmedQuestion(t: Translate): AttackQuestion {
  return {
    title: t('Without a weapon'),
    note: t('A grapple or a shove: it resists with Strength or Dexterity against your DC.'),
    options: [
      { label: t('Punch: 1 + Strength'), change: {} },
      { label: t('Grapple'), change: { unarmed: 'grapple' } },
      { label: t('Shove 5 ft away'), change: { unarmed: 'shove', shove: 'push' } },
      { label: t('Shove it Prone'), change: { unarmed: 'shove', shove: 'prone' } },
      { label: t('Strike with an object at hand'), change: { attackId: 'improvised' } },
    ],
  };
}

/**
 * An attack's question in the turn tray: the attack goes with the way chosen, the first of them
 * the full one; the World Engine rolls everything.
 */
export function AttackChoice({
  question,
  command,
  locked,
  onRun,
  onCancel,
}: {
  readonly question: AttackQuestion;
  readonly command: AttackCommand;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <div className="action-choice" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {question.title}
      </p>
      <small className="action-choice-note">{question.note}</small>
      <div className="action-row">
        {question.options.map((option, index) => (
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
