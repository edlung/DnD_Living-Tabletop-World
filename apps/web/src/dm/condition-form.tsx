import {
  ABILITIES,
  CONDITIONS,
  MAX_EXHAUSTION,
  type Ability,
  type Condition,
  type ConditionDetails,
  type EncounterResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { ABILITY_NAMES } from '../character/words.ts';
import { labelsOf } from '../combat/labels.ts';
import { Field } from '../session/account-forms.tsx';
import { Actions, useReason } from './hand-forms.tsx';
import { CONDITION_WORDS } from './hand-words.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * A condition by the DM's hand (docs/adr/0045-conditions-and-actions.md §1–3), on a character or a
 * creature: every condition, applied or lifted, or Exhaustion's level. Applied in a fight, it may
 * name its source and say how it ends — at the start or the end of someone's turn, after so many
 * of them, and on a save at the end of each of its own turns. The World Engine decides again.
 */
export interface FightMember {
  readonly entityId: string;
  readonly name: string;
}

/** Who is in the running fight, by the DM's names; null when none runs. */
export function useFightRoster(api: WorldApi): readonly FightMember[] | null {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<EncounterResponse>('encounter', signal),
    [api],
  );
  const { resource } = useResource('condition-fight', load);
  const encounter = resource.status === 'ready' ? resource.value.encounter : null;
  if (!encounter) return null;
  const labelOf = labelsOf(encounter, t);
  return encounter.order.map((entityId) => ({ entityId, name: labelOf(entityId) }));
}

const EXHAUSTION = 'exhaustion';
type Choice = Condition | typeof EXHAUSTION;
type Ending = 'dm' | 'start' | 'end';

export function ConditionForm({
  targetId,
  name,
  conditions,
  exhaustion,
  fight,
  locked,
  onSend,
  onCancel,
}: {
  readonly targetId: string;
  readonly name: string;
  readonly conditions: readonly Condition[];
  readonly exhaustion: number;
  /** The running fight's combatants when the target is one of them; else null. */
  readonly fight: readonly FightMember[] | null;
  readonly locked: boolean;
  readonly onSend: (command: DmTableCommand) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [choice, setChoice] = useState<Choice>('poisoned');
  const [level, setLevel] = useState(String(exhaustion));
  const [source, setSource] = useState('');
  const [ending, setEnding] = useState<Ending>('dm');
  const [turnOf, setTurnOf] = useState(targetId);
  const [turns, setTurns] = useState('1');
  const [saving, setSaving] = useState(false);
  const [ability, setAbility] = useState<Ability>('wis');
  const [dc, setDc] = useState('');
  // A save it makes first — a poison, a curse (docs/adr/0050-the-world-around.md §9).
  const [resisting, setResisting] = useState(false);
  const [resistAbility, setResistAbility] = useState<Ability>('con');
  const [resistDc, setResistDc] = useState('');
  const [attempted, setAttempted] = useState(false);
  const why = useReason();
  const held = choice !== EXHAUSTION && conditions.includes(choice);
  // How it ends and its source: applying, in a fight, and not Slowed (its own rule).
  const detailed = fight !== null && choice !== EXHAUSTION && !held && choice !== 'slowed';
  const count = Number(turns);
  const countWrong =
    detailed && ending !== 'dm' && !(Number.isInteger(count) && count >= 1 && count <= 100);
  const difficulty = Number(dc);
  const dcWrong =
    detailed && saving && !(Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 30);
  const firstSave = resisting && choice !== EXHAUSTION && !held;
  const resistDifficulty = Number(resistDc);
  const resistWrong =
    firstSave &&
    !(Number.isInteger(resistDifficulty) && resistDifficulty >= 1 && resistDifficulty <= 30);
  const others = (fight ?? []).filter((member) => member.entityId !== targetId);
  const sorted = [...CONDITIONS].sort((a, b) =>
    t(CONDITION_WORDS[a]).localeCompare(t(CONDITION_WORDS[b])),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (why.reason === '' || countWrong || dcWrong || resistWrong) return;
    if (choice === EXHAUSTION) {
      onSend({ type: 'SetExhaustion', targetId, level: Number(level), reason: why.reason });
      return;
    }
    const details: ConditionDetails = {
      ...(source === '' ? {} : { sourceId: source }),
      ...(ending === 'dm' ? {} : { until: { turnOf, at: ending, turns: count } }),
      ...(saving ? { save: { ability, dc: difficulty } } : {}),
    };
    onSend({
      type: 'SetCondition',
      targetId,
      condition: choice,
      applied: !held,
      ...(detailed && Object.keys(details).length > 0 ? { details } : {}),
      ...(firstSave ? { resist: { ability: resistAbility, dc: resistDifficulty } } : {}),
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
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value as Choice);
            }}
          >
            {sorted.map((option) => (
              <option key={option} value={option}>
                {conditions.includes(option)
                  ? t('{condition} (now)', { condition: t(CONDITION_WORDS[option]) })
                  : t(CONDITION_WORDS[option])}
              </option>
            ))}
            <option value={EXHAUSTION}>
              {exhaustion > 0
                ? t('Exhaustion (now {level})', { level: exhaustion })
                : t('Exhaustion')}
            </option>
          </select>
        )}
      </Field>
      {choice === EXHAUSTION && (
        <Field label={t('Exhaustion level')}>
          {(control) => (
            <select
              {...control}
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
              }}
            >
              {Array.from({ length: MAX_EXHAUSTION + 1 }, (_, value) => (
                <option key={value} value={String(value)}>
                  {value === 0
                    ? t('No exhaustion')
                    : value === MAX_EXHAUSTION
                      ? t('{level}: death', { level: value })
                      : String(value)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {detailed && (
        <>
          <Field label={t('It comes from (optional)')}>
            {(control) => (
              <select
                {...control}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                }}
              >
                <option value="">{t('No one in particular')}</option>
                {others.map((member) => (
                  <option key={member.entityId} value={member.entityId}>
                    {member.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <fieldset className="hand-choice">
            <legend>{t('It ends')}</legend>
            {(
              [
                ['dm', t('When you lift it')],
                ['start', t('At the start of a turn')],
                ['end', t('At the end of a turn')],
              ] as const
            ).map(([value, words]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${ids}-ending`}
                  checked={ending === value}
                  onChange={() => {
                    setEnding(value);
                  }}
                />
                <span>{words}</span>
              </label>
            ))}
            {ending !== 'dm' && (
              <div className="hand-row hand-row--controls">
                <Field label={t('Whose turn')}>
                  {(control) => (
                    <select
                      {...control}
                      value={turnOf}
                      onChange={(event) => {
                        setTurnOf(event.target.value);
                      }}
                    >
                      {fight.map((member) => (
                        <option key={member.entityId} value={member.entityId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field
                  label={t('After how many of those turns')}
                  error={attempted && countWrong ? t('From 1 to 100.') : null}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      value={turns}
                      onChange={(event) => {
                        setTurns(event.target.value);
                      }}
                    />
                  )}
                </Field>
              </div>
            )}
          </fieldset>
          <label className="hand-check">
            <input
              type="checkbox"
              checked={saving}
              onChange={(event) => {
                setSaving(event.target.checked);
              }}
            />
            <span>{t('A save ends it at the end of each of its turns')}</span>
          </label>
          {saving && (
            <div className="hand-row hand-row--controls">
              <Field label={t('Saving throw')}>
                {(control) => (
                  <select
                    {...control}
                    value={ability}
                    onChange={(event) => {
                      setAbility(event.target.value as Ability);
                    }}
                  >
                    {ABILITIES.map((option) => (
                      <option key={option} value={option}>
                        {t(ABILITY_NAMES[option])}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label={t('Difficulty (DC)')}
                error={attempted && dcWrong ? t('From 1 to 30.') : null}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={dc}
                    onChange={(event) => {
                      setDc(event.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          )}
        </>
      )}
      {choice !== EXHAUSTION && !held && (
        <>
          <label className="hand-check">
            <input
              type="checkbox"
              checked={resisting}
              onChange={(event) => {
                setResisting(event.target.checked);
              }}
            />
            <span>{t('A save first: only a failure brings it (a poison, a curse)')}</span>
          </label>
          {resisting && (
            <div className="hand-row hand-row--controls">
              <Field label={t('Saving throw')}>
                {(control) => (
                  <select
                    {...control}
                    value={resistAbility}
                    onChange={(event) => {
                      setResistAbility(event.target.value as Ability);
                    }}
                  >
                    {ABILITIES.map((option) => (
                      <option key={option} value={option}>
                        {t(ABILITY_NAMES[option])}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label={t('Difficulty (DC)')}
                error={attempted && resistWrong ? t('From 1 to 30.') : null}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={30}
                    value={resistDc}
                    onChange={(event) => {
                      setResistDc(event.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          )}
        </>
      )}
      {why.field(t, attempted)}
      <Actions
        label={
          choice === EXHAUSTION
            ? t('Set the level')
            : held
              ? t('Lift the condition')
              : t('Apply the condition')
        }
        locked={locked}
        onCancel={onCancel}
      />
    </form>
  );
}
