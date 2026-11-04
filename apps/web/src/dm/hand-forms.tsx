import { DAMAGE_TYPES, type CharacterSheet, type DamageType } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import { Field } from '../session/account-forms.tsx';
import { DAMAGE_WORDS } from './hand-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The DM's hand on one character (docs/adr/0043-dm-screen.md §1): damage or healing, a condition
 * (`condition-form.tsx`), Heroic Inspiration — each with the DM's reason, checked here before it is sent (the World
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
export function useReason() {
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

export function Actions({
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
  // Temporary hit points and a lowered maximum too (docs/adr/0048-hit-points.md §1–2).
  const [change, setChange] = useState<HitPointChange>('damage');
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
        {HIT_POINT_CHANGES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`${ids}-change`}
              checked={change === option}
              onChange={() => {
                setChange(option);
              }}
            />
            {t(CHANGE_WORDS[option])}
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
      <Actions label={t(CHANGE_ACTIONS[change])} locked={locked} onCancel={onCancel} />
    </form>
  );
}

const HIT_POINT_CHANGES = ['damage', 'healing', 'temporary', 'reduce-maximum'] as const;
type HitPointChange = (typeof HIT_POINT_CHANGES)[number];
const CHANGE_WORDS: Readonly<Record<HitPointChange, string>> = {
  damage: 'Damage',
  healing: 'Healing',
  temporary: 'Temporary hit points',
  'reduce-maximum': 'Lower the maximum',
};
const CHANGE_ACTIONS: Readonly<Record<HitPointChange, string>> = {
  damage: 'Deal the damage',
  healing: 'Heal',
  temporary: 'Give temporary hit points',
  'reduce-maximum': 'Lower the maximum',
};

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
