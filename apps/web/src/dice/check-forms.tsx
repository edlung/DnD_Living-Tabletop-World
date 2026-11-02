import { ROLL_MODES, type EntityRef, type RollMode } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { checkGroups, checkOf, MODE_WORDS } from './checks.ts';
import { FaceFields, facesOf, useOwnDice } from './own-dice.tsx';
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

/**
 * A player's own check (Stage 510): any skill, ability or save, with the sheet's bonus — for the
 * table or the DM alone, rolled by the app or off one's own d20s (ADR 0044 §4).
 */
export function CheckRoller() {
  const t = useT();
  const table = useDiceTable();
  const own = useOwnDice();
  const ids = useId();
  const [value, setValue] = useState('skill:perception');
  const [mode, setMode] = useState<RollMode>('normal');
  const [secret, setSecret] = useState(false);
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState<string[]>([]);
  if (!table?.characterId) return null;
  const characterId = table.characterId;
  const check = checkOf(value);
  const dice = mode === 'normal' ? [20] : [20, 20];
  const faces = entering ? facesOf(dice, entered) : null;
  return (
    <section className="sheet-section dice-check" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Roll a check')}</h3>
      <label htmlFor={`${ids}-check`}>{t('Check')}</label>
      <CheckSelect id={`${ids}-check`} value={value} onChange={setValue} />
      <ModeChoice name={`${ids}-mode`} mode={mode} onChange={setMode} />
      <label className="dice-own">
        <input
          type="checkbox"
          checked={secret}
          onChange={(event) => {
            setSecret(event.target.checked);
          }}
        />
        <span>{t('Only the DM and me')}</span>
      </label>
      {own && (
        <label className="dice-own">
          <input
            type="checkbox"
            checked={entering}
            onChange={(event) => {
              setEntering(event.target.checked);
            }}
          />
          <span>{t('I roll my own dice')}</span>
        </label>
      )}
      {entering && <FaceFields dice={dice} entered={entered} onChange={setEntered} />}
      <button
        type="button"
        className="primary-button"
        disabled={!check || table.busy || (entering && faces === null)}
        onClick={() => {
          if (!check) return;
          void table
            .roll({
              kind: 'check',
              characterId,
              check,
              mode,
              ...(secret ? { private: true } : {}),
              ...(faces ? { faces } : {}),
            })
            .then((done) => {
              if (done) setEntered([]);
            });
        }}
      >
        {entering ? t('Enter the roll') : t('Roll the check')}
      </button>
    </section>
  );
}

/** Asks everyone at the table at once (docs/adr/0043-dm-screen.md §1): one request each. */
const EVERYONE = '*';

/**
 * The DM asks a character — or everyone at the table, as one group — for a check, with an
 * optional DC the players never see.
 */
export function AskForCheck({ characters }: { readonly characters: readonly EntityRef[] }) {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  const [characterId, setCharacterId] = useState(characters[0]?.entityId ?? '');
  const [value, setValue] = useState('skill:perception');
  const [mode, setMode] = useState<RollMode>('normal');
  const [dc, setDc] = useState('');
  const [secret, setSecret] = useState(false);
  if (!table?.isDm) return null;
  if (characters.length === 0) {
    return <p className="muted">{t('No characters are at the table to ask.')}</p>;
  }
  const check = checkOf(value);
  const group = characters.length >= 2;
  const chosen =
    characterId === EVERYONE && group
      ? EVERYONE
      : characters.some((entry) => entry.entityId === characterId)
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
        {group && <option value={EVERYONE}>{t('Everyone at the table')}</option>}
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
      <label className="dice-own">
        <input
          type="checkbox"
          checked={secret}
          onChange={(event) => {
            setSecret(event.target.checked);
          }}
        />
        <span>{t('In private: only that player sees the roll')}</span>
      </label>
      <button
        type="button"
        className="primary-button"
        disabled={!check || !valid || table.busy}
        onClick={() => {
          if (!check) return;
          const asked =
            chosen === EVERYONE
              ? { characterIds: characters.slice(0, 8).map((entry) => entry.entityId) }
              : { characterId: chosen };
          void table
            .ask({
              ...asked,
              check,
              mode,
              ...(Number.isNaN(difficulty) ? {} : { dc: difficulty }),
              ...(secret ? { private: true } : {}),
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
