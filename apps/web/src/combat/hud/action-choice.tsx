import {
  ACTION_SKILLS,
  type CombatAction,
  type ContextAction,
  type Skill,
  type WeaponId,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import { skillName } from '../../character/words.ts';
import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { weaponWords } from '../combat-art.ts';

/**
 * What an action asks before it is sent (docs/adr/0045-conditions-and-actions.md §5): the skill of
 * Search, Study or Influence; for Ready, the attack held — one the tray lists against the chosen
 * creature — and its trigger in the player's words. The World Engine decides on the action.
 */
export function ActionChoice({
  action,
  actorId,
  targetId,
  attacks,
  locked,
  onRun,
  onCancel,
}: {
  readonly action: CombatAction;
  readonly actorId: string;
  readonly targetId: string | null;
  /** The attack options listed against the chosen creature (Ready holds one of them). */
  readonly attacks: readonly ContextAction[];
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const skills = ACTION_SKILLS[action] ?? [];
  const [skill, setSkill] = useState<Skill | undefined>(skills[0]);
  const weapons = attacks.flatMap((option): WeaponId[] =>
    option.id === 'longbow_attack' ? ['longbow'] : option.weapon ? [option.weapon] : [],
  );
  const [attackId, setAttackId] = useState(weapons[0] ?? '');
  const [trigger, setTrigger] = useState('');
  const ready = action === 'ready';
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ready) {
      if (targetId === null || attackId === '' || trigger.trim() === '') return;
      onRun({
        kind: 'command',
        command: {
          type: 'TakeAction',
          combatantId: actorId,
          action,
          targetId,
          readied: { attackId, trigger: trigger.trim() },
        },
      });
      return;
    }
    if (skill === undefined) return;
    onRun({
      kind: 'command',
      command: { type: 'TakeAction', combatantId: actorId, action, skill },
    });
  };
  return (
    <form className="action-choice" noValidate onSubmit={submit} aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {ready ? t('Ready an attack') : t(ACTION_TITLES[action])}
      </p>
      <div className="action-choice-fields">
        {ready ? (
          <>
            <div className="action-choice-field">
              <label htmlFor={`${ids}-attack`}>{t('Which attack')}</label>
              <select
                id={`${ids}-attack`}
                value={attackId}
                onChange={(event) => {
                  setAttackId(event.target.value);
                }}
              >
                {weapons.map((weapon) => (
                  <option key={weapon} value={weapon}>
                    {weaponWords(t, weapon)}
                  </option>
                ))}
              </select>
            </div>
            <div className="action-choice-field">
              <label htmlFor={`${ids}-trigger`}>{t('When it happens')}</label>
              <input
                id={`${ids}-trigger`}
                value={trigger}
                maxLength={120}
                placeholder={t('When it steps out of cover')}
                onChange={(event) => {
                  setTrigger(event.target.value);
                }}
              />
            </div>
          </>
        ) : (
          <div className="action-choice-field">
            <label htmlFor={`${ids}-skill`}>{t('Skill')}</label>
            <select
              id={`${ids}-skill`}
              value={skill}
              onChange={(event) => {
                setSkill(event.target.value as Skill);
              }}
            >
              {skills.map((option) => (
                <option key={option} value={option}>
                  {skillName(t, option)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="action-row">
          <button
            type="submit"
            className="primary-button"
            disabled={locked || (ready && (attackId === '' || trigger.trim() === ''))}
          >
            {ready ? t('Ready the attack') : t(ACTION_TITLES[action])}
          </button>
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </form>
  );
}

const ACTION_TITLES: Readonly<Record<CombatAction, string>> = {
  dash: 'Dash',
  disengage: 'Disengage',
  dodge: 'Dodge',
  help: 'Help',
  hide: 'Hide',
  influence: 'Influence',
  ready: 'Ready an action',
  search: 'Search',
  study: 'Study',
  utilize: 'Utilize',
  escape: 'Escape a grapple',
  release: 'Let go',
};
