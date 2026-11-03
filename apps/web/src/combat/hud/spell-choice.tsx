import { TRANSMUTABLE, type ContextSpell, type MetamagicId } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { METAMAGIC_NAMES } from '../../character/feature-words.ts';
import { DAMAGE_WORDS } from '../../dm/hand-words.ts';
import type { ExplorationIntent } from '../../exploration/use-action.ts';
import { castSpellCommand } from '../combat-bindings.ts';

/**
 * A spell's slot, asked in the turn tray when more than one could pay for it
 * (docs/adr/0052-spells-as-data.md §3): the lowest first; a higher one adds what the spell names.
 * A Sorcerer chooses the Metamagic it spends on it here too, and Transmuted Spell's damage type
 * (docs/adr/0056-characters-from-the-srd.md §4). The World Engine judges the cast again and rolls
 * everything.
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
  const [option, setOption] = useState<MetamagicId | ''>('');
  const [type, setType] = useState<(typeof TRANSMUTABLE)[number]>('fire');
  const offered = spell.metamagic ?? [];
  const metamagic =
    option === ''
      ? undefined
      : { options: [option], ...(option === 'transmuted-spell' ? { transmuted: type } : {}) };
  const cast = (using: { readonly slotLevel: number } | undefined) => {
    onRun({
      kind: 'command',
      command: castSpellCommand(spell, actorId, target, using, metamagic),
    });
  };
  return (
    <div className="action-choice" role="group" aria-labelledby={`${ids}-title`}>
      <p id={`${ids}-title`} className="action-choice-title">
        {spell.slots.length > 1
          ? t('{spell}: which slot?', { spell: t(spell.name) })
          : t('{spell}: how?', { spell: t(spell.name) })}
      </p>
      {spell.slots.length > 1 && (
        <small className="action-choice-note">
          {spell.perSlot
            ? t('Each level above {level} adds {count} more.', {
                level: spell.level,
                count: spell.perSlot,
              })
            : t('A higher slot adds what the spell says for it.')}
        </small>
      )}
      {offered.length > 0 && (
        <div className="action-choice-fields">
          <div className="action-choice-field">
            <label htmlFor={`${ids}-metamagic`}>{t('Metamagic')}</label>
            <select
              id={`${ids}-metamagic`}
              value={option}
              onChange={(event) => {
                setOption(event.target.value as MetamagicId | '');
              }}
            >
              <option value="">{t('No Metamagic')}</option>
              {offered.map((one) => (
                <option key={one.optionId} value={one.optionId}>
                  {t(
                    one.cost === 1 ? '{name} (1 Sorcery Point)' : '{name} ({cost} Sorcery Points)',
                    {
                      name: t(METAMAGIC_NAMES[one.optionId]),
                      cost: one.cost,
                    },
                  )}
                </option>
              ))}
            </select>
          </div>
          {option === 'transmuted-spell' && (
            <div className="action-choice-field">
              <label htmlFor={`${ids}-type`}>{t('Damage type')}</label>
              <select
                id={`${ids}-type`}
                value={type}
                onChange={(event) => {
                  setType(event.target.value as (typeof TRANSMUTABLE)[number]);
                }}
              >
                {TRANSMUTABLE.map((one) => (
                  <option key={one} value={one}>
                    {t(DAMAGE_WORDS[one])}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <div className="action-row">
        {spell.slots.length === 0 ? (
          <button
            type="button"
            className="primary-button"
            disabled={locked}
            onClick={() => {
              cast(undefined);
            }}
          >
            {t('Cast {spell}', { spell: t(spell.name) })}
          </button>
        ) : (
          spell.slots.map((slotLevel, index) => (
            <button
              key={slotLevel}
              type="button"
              className={index === 0 ? 'primary-button' : undefined}
              disabled={locked}
              onClick={() => {
                cast({ slotLevel });
              }}
            >
              {t('Level {level} slot', { level: slotLevel })}
            </button>
          ))
        )}
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
