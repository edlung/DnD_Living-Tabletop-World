import {
  CONTAGION_IDS,
  TRAP_IDS,
  type ContagionId,
  type EntityRef,
  type TrapId,
} from '@ltw/contracts';
import { useT, type Translate } from '@ltw/ui';
import { useId, useState, type SubmitEvent } from 'react';

import { CONTAGION_WORDS, TRAP_WORDS, trapTiers } from '../rules/toolbox-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The Gameplay Toolbox at the table (docs/adr/0055-rules-reference-and-toolbox.md §4), on the DM's
 * Party sheet: spring one of the SRD's traps on the characters it catches, at the tier of their
 * levels, or put their minds under stress. The World Engine rolls every save and every die; the
 * trap's words are in the Rules sheet's Toolbox.
 */

/** The Toolbox's sample mental stress effects, and the DM's own. */
const STRESS = [
  { label: 'A hallucinogen: Wisdom DC 10, 1d6', ability: 'wis', dc: 10, dice: 1 },
  { label: 'A fiendish idol: Wisdom DC 15, 3d6', ability: 'wis', dc: 15, dice: 3 },
  { label: 'The Far Realm: Wisdom DC 20, 9d6', ability: 'wis', dc: 20, dice: 9 },
] as const;
const ABILITY_WORDS = { wis: 'Wisdom', int: 'Intelligence', cha: 'Charisma' } as const;
type StressAbility = keyof typeof ABILITY_WORDS;

export function ToolboxForms({
  characters,
  locked,
  onRun,
}: {
  readonly characters: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  if (characters.length === 0) return null;
  return (
    <>
      <TrapForm characters={characters} locked={locked} onRun={onRun} />
      <StressForm characters={characters} locked={locked} onRun={onRun} />
      <ContagionForm characters={characters} locked={locked} onRun={onRun} />
    </>
  );
}

function Who({
  t,
  characters,
  chosen,
  onChange,
  legend,
  error,
}: {
  readonly t: Translate;
  readonly characters: readonly EntityRef[];
  readonly chosen: ReadonlySet<string>;
  readonly onChange: (next: ReadonlySet<string>) => void;
  readonly legend: string;
  readonly error: string | null;
}) {
  const ids = useId();
  return (
    <fieldset className="toolbox-who" aria-describedby={error ? `${ids}-error` : undefined}>
      <legend>{legend}</legend>
      {characters.map((entry) => (
        <label key={entry.entityId} className="toolbox-who-row">
          <input
            type="checkbox"
            checked={chosen.has(entry.entityId)}
            onChange={(event) => {
              const next = new Set(chosen);
              if (event.target.checked) next.add(entry.entityId);
              else next.delete(entry.entityId);
              onChange(next);
            }}
          />
          <span>{entry.name}</span>
        </label>
      ))}
      {error && (
        <p id={`${ids}-error`} className="account-field-error" role="alert">
          {t(error)}
        </p>
      )}
    </fieldset>
  );
}

function TrapForm({
  characters,
  locked,
  onRun,
}: {
  readonly characters: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const [trapId, setTrapId] = useState<TrapId>('collapsing-roof');
  const [tier, setTier] = useState(1);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  // The rolling stone is made for one range of levels (11–20).
  const tiers = trapTiers(trapId);
  const level = Math.min(tier, tiers.length);
  const spring = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (chosen.size === 0) return;
    onRun({ type: 'SpringTrap', trapId, tier: level, targetIds: [...chosen] });
    setAttempted(false);
  };
  return (
    <form
      className="sheet-section toolbox-form"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={spring}
    >
      <h3 id={`${ids}-title`}>{t('A trap')}</h3>
      <p className="muted">
        {t('Its save, its damage and what it leaves are in the Toolbox of the Rules sheet.')}
      </p>
      <div className="toolbox-fields">
        <label className="toolbox-field">
          <span>{t('Trap')}</span>
          <select
            value={trapId}
            onChange={(event) => {
              setTrapId(event.target.value as TrapId);
            }}
          >
            {TRAP_IDS.map((id) => (
              <option key={id} value={id}>
                {t(TRAP_WORDS[id])}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbox-field">
          <span>{t('For characters of')}</span>
          <select
            value={level}
            onChange={(event) => {
              setTier(Number(event.target.value));
            }}
          >
            {tiers.map((range, index) => (
              <option key={range} value={index + 1}>
                {t('levels {range}', { range })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Who
        t={t}
        characters={characters}
        chosen={chosen}
        onChange={setChosen}
        legend={t('Who it catches')}
        error={attempted && chosen.size === 0 ? 'Choose who it catches.' : null}
      />
      <button type="submit" className="primary-button" disabled={locked}>
        {t('Spring the trap')}
      </button>
    </form>
  );
}

function StressForm({
  characters,
  locked,
  onRun,
}: {
  readonly characters: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const [ability, setAbility] = useState<StressAbility>('wis');
  const [dc, setDc] = useState('15');
  const [dice, setDice] = useState('3');
  const [half, setHalf] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const difficulty = Number(dc);
  const count = Number(dice);
  const dcWrong = !(Number.isInteger(difficulty) && difficulty >= 5 && difficulty <= 30);
  const diceWrong = !(Number.isInteger(count) && count >= 1 && count <= 20);
  const inflict = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (chosen.size === 0 || dcWrong || diceWrong) return;
    onRun({
      type: 'InflictMentalStress',
      targetIds: [...chosen],
      ability,
      dc: difficulty,
      dice: count,
      onSuccess: half ? 'half' : 'none',
    });
    setAttempted(false);
  };
  return (
    <form
      className="sheet-section toolbox-form"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={inflict}
    >
      <h3 id={`${ids}-title`}>{t('Mental stress')}</h3>
      <div className="toolbox-presets" role="group" aria-label={t('The Toolbox’s examples')}>
        {STRESS.map((sample) => (
          <button
            key={sample.label}
            type="button"
            onClick={() => {
              setAbility(sample.ability);
              setDc(String(sample.dc));
              setDice(String(sample.dice));
            }}
          >
            {t(sample.label)}
          </button>
        ))}
      </div>
      <div className="toolbox-fields">
        <label className="toolbox-field">
          <span>{t('Save')}</span>
          <select
            value={ability}
            onChange={(event) => {
              setAbility(event.target.value as StressAbility);
            }}
          >
            {(Object.keys(ABILITY_WORDS) as StressAbility[]).map((key) => (
              <option key={key} value={key}>
                {t(ABILITY_WORDS[key])}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbox-field">
          <span>{t('DC')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={5}
            max={30}
            value={dc}
            aria-invalid={attempted && dcWrong}
            onChange={(event) => {
              setDc(event.target.value);
            }}
          />
        </label>
        <label className="toolbox-field">
          <span>{t('Psychic damage, d6')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={dice}
            aria-invalid={attempted && diceWrong}
            onChange={(event) => {
              setDice(event.target.value);
            }}
          />
        </label>
      </div>
      <label className="toolbox-who-row">
        <input
          type="checkbox"
          checked={half}
          onChange={(event) => {
            setHalf(event.target.checked);
          }}
        />
        <span>{t('Half the damage on a successful save')}</span>
      </label>
      <Who
        t={t}
        characters={characters}
        chosen={chosen}
        onChange={setChosen}
        legend={t('Who feels it')}
        error={attempted && chosen.size === 0 ? 'Choose who feels it.' : null}
      />
      <button type="submit" className="primary-button" disabled={locked}>
        {t('Inflict mental stress')}
      </button>
    </form>
  );
}

/**
 * A magical contagion given to one character; the World Engine rolls the Constitution save the
 * contagion names. Its course is followed on the character's card.
 */
function ContagionForm({
  characters,
  locked,
  onRun,
}: {
  readonly characters: readonly EntityRef[];
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const ids = useId();
  const [contagionId, setContagionId] = useState<ContagionId>('sewer-plague');
  const [who, setWho] = useState(characters[0]?.entityId ?? '');
  const chosen = characters.some((entry) => entry.entityId === who)
    ? who
    : (characters[0]?.entityId ?? '');
  const infect = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (chosen === '') return;
    onRun({ type: 'InfectWithContagion', targetId: chosen, contagionId });
  };
  return (
    <form
      className="sheet-section toolbox-form"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={infect}
    >
      <h3 id={`${ids}-title`}>{t('A contagion')}</h3>
      <p className="muted">
        {t(
          'Its course is followed on the character’s card: it takes hold, the character fights it, or magic ends it.',
        )}
      </p>
      <div className="toolbox-fields">
        <label className="toolbox-field">
          <span>{t('Contagion')}</span>
          <select
            value={contagionId}
            onChange={(event) => {
              setContagionId(event.target.value as ContagionId);
            }}
          >
            {CONTAGION_IDS.map((id) => (
              <option key={id} value={id}>
                {t(CONTAGION_WORDS[id])}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbox-field">
          <span>{t('Who')}</span>
          <select
            value={chosen}
            onChange={(event) => {
              setWho(event.target.value);
            }}
          >
            {characters.map((entry) => (
              <option key={entry.entityId} value={entry.entityId}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" className="primary-button" disabled={locked}>
        {t('Infect')}
      </button>
    </form>
  );
}
