import {
  CONDITIONS,
  DAMAGE_TYPES,
  type CharacterSheet,
  type Condition,
  type DamageType,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import { Field } from '../session/account-forms.tsx';
import { CONDITION_WORDS, DAMAGE_WORDS } from './hand-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The DM's hand on one character (docs/adr/0043-dm-screen.md §1): damage or healing, a condition,
 * Heroic Inspiration — each with the DM's reason, checked here before it is sent (the World
 * Engine decides again). A form sends one command and closes; what the world did shows in the
 * action's notice and the card's next read.
 */
export type HandForm = 'hit-points' | 'condition' | 'inspiration';

interface FormProps {
  readonly characterId: string;
  readonly name: string;
  readonly sheet: CharacterSheet;
  readonly locked: boolean;
  readonly onSend: (command: DmTableCommand) => void;
  readonly onCancel: () => void;
}

const REASON_MAX = 200;

/** The reason every change by hand carries: required, at most 200 characters. */
function useReason() {
  const [reason, setReason] = useState('');
  return {
    reason: reason.trim(),
    field: (t: ReturnType<typeof useT>, attempted: boolean) => (
      <Field
        label={t('Why (kept in your history)')}
        error={attempted && reason.trim() === '' ? t('Say why, in a few words.') : null}
      >
        {(control) => (
          <input
            {...control}
            value={reason}
            maxLength={REASON_MAX}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        )}
      </Field>
    ),
  };
}

function Actions({
  label,
  locked,
  onCancel,
}: {
  readonly label: string;
  readonly locked: boolean;
  readonly onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="action-row">
      <button type="submit" className="primary-button" disabled={locked}>
        {label}
      </button>
      <button type="button" onClick={onCancel}>
        {t('Cancel')}
      </button>
    </div>
  );
}

export function HitPointsForm({ characterId, name, locked, onSend, onCancel }: FormProps) {
  const t = useT();
  const ids = useId();
  const [change, setChange] = useState<'damage' | 'healing'>('damage');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<DamageType>('bludgeoning');
  const [attempted, setAttempted] = useState(false);
  const why = useReason();
  const value = Number.parseInt(amount, 10);
  const amountError =
    attempted && !(value >= 1 && value <= 999) ? t('A whole number from 1 to 999.') : null;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!(value >= 1 && value <= 999) || why.reason === '') return;
    onSend({
      type: 'AdjustHitPoints',
      targetId: characterId,
      change,
      amount: value,
      ...(change === 'damage' ? { damageType: type } : {}),
      reason: why.reason,
    });
  };
  return (
    <form className="hand-form" noValidate onSubmit={submit} aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>{t('Hit points of {name}', { name })}</h4>
      <fieldset className="hand-choice">
        <legend className="visually-hidden">{t('Damage or healing')}</legend>
        {(['damage', 'healing'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`${ids}-change`}
              checked={change === option}
              onChange={() => {
                setChange(option);
              }}
            />
            {option === 'damage' ? t('Damage') : t('Healing')}
          </label>
        ))}
      </fieldset>
      <div className="hand-row">
        <Field label={t('Amount')} error={amountError}>
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          )}
        </Field>
        {change === 'damage' && (
          <Field label={t('Damage type')}>
            {(control) => (
              <select
                {...control}
                value={type}
                onChange={(event) => {
                  setType(event.target.value as DamageType);
                }}
              >
                {DAMAGE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {t(DAMAGE_WORDS[option])}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
      {why.field(t, attempted)}
      <Actions
        label={change === 'damage' ? t('Deal the damage') : t('Heal')}
        locked={locked}
        onCancel={onCancel}
      />
    </form>
  );
}

export function ConditionForm({ characterId, name, sheet, locked, onSend, onCancel }: FormProps) {
  const t = useT();
  const ids = useId();
  const [condition, setCondition] = useState<Condition>(CONDITIONS[0]);
  const [attempted, setAttempted] = useState(false);
  const why = useReason();
  const held = sheet.conditions.includes(condition);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (why.reason === '') return;
    onSend({
      type: 'SetCondition',
      targetId: characterId,
      condition,
      applied: !held,
      reason: why.reason,
    });
  };
  return (
    <form className="hand-form" noValidate onSubmit={submit} aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>{t('A condition of {name}', { name })}</h4>
      <Field label={t('Condition')}>
        {(control) => (
          <select
            {...control}
            value={condition}
            onChange={(event) => {
              setCondition(event.target.value as Condition);
            }}
          >
            {CONDITIONS.map((option) => (
              <option key={option} value={option}>
                {sheet.conditions.includes(option)
                  ? t('{condition} (now)', { condition: t(CONDITION_WORDS[option]) })
                  : t(CONDITION_WORDS[option])}
              </option>
            ))}
          </select>
        )}
      </Field>
      {why.field(t, attempted)}
      <Actions
        label={held ? t('Lift the condition') : t('Apply the condition')}
        locked={locked}
        onCancel={onCancel}
      />
    </form>
  );
}

export function InspirationForm({ characterId, name, sheet, locked, onSend, onCancel }: FormProps) {
  const t = useT();
  const ids = useId();
  const [attempted, setAttempted] = useState(false);
  const why = useReason();
  const inspired = sheet.heroicInspiration === true;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (why.reason === '') return;
    onSend({
      type: 'SetInspiration',
      characterId,
      inspired: !inspired,
      reason: why.reason,
    });
  };
  return (
    <form className="hand-form" noValidate onSubmit={submit} aria-labelledby={`${ids}-title`}>
      <h4 id={`${ids}-title`}>{t('Heroic Inspiration of {name}', { name })}</h4>
      {why.field(t, attempted)}
      <Actions
        label={inspired ? t('Take it back') : t('Grant Heroic Inspiration')}
        locked={locked}
        onCancel={onCancel}
      />
    </form>
  );
}
