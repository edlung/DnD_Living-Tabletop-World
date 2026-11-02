import { ROLL_MODES, type EntityRef, type RollMode } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { checkGroups, checkOf, MODE_WORDS } from './checks.ts';
import { useDiceTable } from './table.tsx';

function CheckSelect({
  id,
  value,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {checkGroups(t).map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ModeChoice({
  name,
  mode,
  onChange,
}: {
  readonly name: string;
  readonly mode: RollMode;
  readonly onChange: (mode: RollMode) => void;
}) {
  const t = useT();
  return (
    <fieldset className="dice-modes">
      <legend>{t('How to roll')}</legend>
      {ROLL_MODES.map((option) => (
        <label key={option} className="dice-mode">
          <input
            type="radio"
            name={name}
            value={option}
            checked={mode === option}
            onChange={() => {
              onChange(option);
            }}
          />
          <span>{t(MODE_WORDS[option])}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A player's own check (Stage 510): any skill, ability or save, with the sheet's bonus. */
export function CheckRoller() {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  const [value, setValue] = useState('skill:perception');
  const [mode, setMode] = useState<RollMode>('normal');
  if (!table?.characterId) return null;
  const characterId = table.characterId;
  const check = checkOf(value);
  return (
    <section className="sheet-section dice-check" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Roll a check')}</h3>
      <label htmlFor={`${ids}-check`}>{t('Check')}</label>
      <CheckSelect id={`${ids}-check`} value={value} onChange={setValue} />
      <ModeChoice name={`${ids}-mode`} mode={mode} onChange={setMode} />
      <button
        type="button"
        className="primary-button"
        disabled={!check || table.busy}
        onClick={() => {
          if (check) void table.roll({ kind: 'check', characterId, check, mode });
        }}
      >
        {t('Roll the check')}
      </button>
    </section>
  );
}

/** The DM asks a character for a check, with an optional DC the players never see. */
export function AskForCheck({ characters }: { readonly characters: readonly EntityRef[] }) {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  const [characterId, setCharacterId] = useState(characters[0]?.entityId ?? '');
  const [value, setValue] = useState('skill:perception');
  const [mode, setMode] = useState<RollMode>('normal');
  const [dc, setDc] = useState('');
  if (!table?.isDm) return null;
  if (characters.length === 0) {
    return <p className="muted">{t('No characters are at the table to ask.')}</p>;
  }
  const check = checkOf(value);
  const chosen = characters.some((entry) => entry.entityId === characterId)
    ? characterId
    : (characters[0]?.entityId ?? '');
  const difficulty = Number.parseInt(dc, 10);
  const valid = Number.isNaN(difficulty) || (difficulty >= 1 && difficulty <= 40);
  return (
    <section className="sheet-section dice-check" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Ask for a check')}</h3>
      <label htmlFor={`${ids}-who`}>{t('Character')}</label>
      <select
        id={`${ids}-who`}
        value={chosen}
        onChange={(event) => {
          setCharacterId(event.target.value);
        }}
      >
        {characters.map((entry) => (
          <option key={entry.entityId} value={entry.entityId}>
            {entry.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${ids}-check`}>{t('Check')}</label>
      <CheckSelect id={`${ids}-check`} value={value} onChange={setValue} />
      <ModeChoice name={`${ids}-mode`} mode={mode} onChange={setMode} />
      <label htmlFor={`${ids}-dc`}>{t('Difficulty (DC), seen only by you')}</label>
      <input
        id={`${ids}-dc`}
        type="number"
        inputMode="numeric"
        min={1}
        max={40}
        value={dc}
        aria-invalid={!valid}
        onChange={(event) => {
          setDc(event.target.value);
        }}
      />
      <button
        type="button"
        className="primary-button"
        disabled={!check || !valid || table.busy}
        onClick={() => {
          if (!check) return;
          void table
            .ask({
              characterId: chosen,
              check,
              mode,
              ...(Number.isNaN(difficulty) ? {} : { dc: difficulty }),
            })
            .then((done) => {
              if (done) setDc('');
            });
        }}
      >
        {t('Ask')}
      </button>
    </section>
  );
}
