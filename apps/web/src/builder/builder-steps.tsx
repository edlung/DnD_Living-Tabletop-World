import {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  type Ability,
  type CharacterOptionsResponse,
  type ChoiceProblem,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, type ReactNode } from 'react';

import { ABILITY_NAMES, ABILITY_ORDER, className, signed } from '../character/words.ts';
import type { Builder, Draft } from './use-builder.ts';

/**
 * The builder's first steps (docs/adr/0056-characters-from-the-srd.md §2): the class, the origin
 * — species with its option, background with its increases — and the ability scores by the
 * standard array, point buy or the World Engine's rolls.
 */
export function Problems({ problems }: { readonly problems: readonly ChoiceProblem[] }) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <div role="status">
      <ul className="builder-problems">
        {problems.map((problem) => (
          <li key={`${problem.field}:${problem.message}`}>{t(problem.message, problem.params)}</li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled control: its label beside it, not around it, so its name is the label's words. */
export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="builder-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

/** A row of cards to pick one from: each a name and a line. */
function Cards<T extends string>({
  label,
  items,
  chosen,
  onChoose,
}: {
  readonly label: string;
  readonly items: readonly {
    readonly id: T;
    readonly name: string;
    readonly line: string;
    readonly lang?: string | undefined;
  }[];
  readonly chosen: T | null;
  readonly onChoose: (id: T) => void;
}) {
  return (
    <div className="builder-cards" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={chosen === item.id}
          lang={item.lang}
          className="builder-card"
          onClick={() => {
            onChoose(item.id);
          }}
        >
          <span className="builder-card-name">{item.name}</span>
          <span className="builder-card-line">{item.line}</span>
        </button>
      ))}
    </div>
  );
}

export function ClassStep({
  options,
  builder,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
}) {
  const t = useT();
  const { draft, update } = builder;
  const chosen = options.classes.find((one) => one.classId === draft.classId);
  return (
    <div className="builder-step">
      <Cards
        label={t('Class')}
        items={options.classes.map((one) => ({
          id: one.classId,
          name: className(t, one.classId),
          line: t('d{die} hit points · {ability}', {
            die: one.hitDie,
            ability: t(one.primaryAbility),
          }),
        }))}
        chosen={draft.classId}
        onChoose={(classId) => {
          // A new class starts its own choices over.
          update({
            classId,
            skills: [],
            expertise: [],
            tools: [],
            cantrips: [],
            spells: [],
            spellbook: [],
            invocations: [],
            weaponMasteries: [],
            equipment: { ...draft.equipment, classOption: 'A', picks: [] },
          });
        }}
      />
      {chosen && (
        <dl className="builder-facts">
          <dt>{t('Saving throws')}</dt>
          <dd>{chosen.savingThrows.map((ability) => t(ABILITY_NAMES[ability])).join(', ')}</dd>
          <dt>{t('Armor')}</dt>
          <dd lang={chosen.language === options.language ? undefined : chosen.language}>
            {chosen.armor}
          </dd>
          <dt>{t('Weapons')}</dt>
          <dd lang={chosen.language === options.language ? undefined : chosen.language}>
            {chosen.weapons}
          </dd>
          <dt>{t('At level 1')}</dt>
          <dd lang={chosen.language === options.language ? undefined : chosen.language}>
            {chosen.features.join(', ')}
          </dd>
        </dl>
      )}
      <Problems problems={builder.problemsOf('classId')} />
    </div>
  );
}

export function OriginStep({
  options,
  builder,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
}) {
  const t = useT();
  const ids = useId();
  const { draft, update } = builder;
  const species = options.species.find((one) => one.speciesId === draft.speciesId);
  const background = options.backgrounds.find((one) => one.backgroundId === draft.backgroundId);
  return (
    <div className="builder-step">
      <h3>{t('Species')}</h3>
      <Cards
        label={t('Species')}
        items={options.species.map((one) => ({
          id: one.speciesId,
          lang: one.language === options.language ? undefined : one.language,
          name: one.name,
          line: t('{speed} ft · {traits}', { speed: one.speedFt, traits: one.traits.join(', ') }),
        }))}
        chosen={draft.speciesId}
        onChoose={(speciesId) => {
          // A new species asks its own options again.
          update({
            speciesId,
            speciesOption: undefined,
            size: undefined,
            speciesAbility: undefined,
            originFeat: undefined,
            moreSkills: [],
          });
        }}
      />
      {species && species.options.length > 0 && (
        <Field label={t('Lineage or ancestry')}>
          {(id) => (
            <select
              id={id}
              value={draft.speciesOption ?? ''}
              onChange={(event) => {
                update({ speciesOption: event.target.value || undefined });
              }}
            >
              <option value="">{t('Choose…')}</option>
              {species.options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  lang={species.language === options.language ? undefined : species.language}
                >
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {species?.choosesSize && (
        <fieldset className="builder-inline">
          <legend>{t('Size')}</legend>
          {(['medium', 'small'] as const).map((size) => (
            <label key={size}>
              <input
                type="radio"
                name={`${ids}-size`}
                checked={(draft.size ?? 'medium') === size}
                onChange={() => {
                  update({ size });
                }}
              />
              {t(size === 'small' ? 'Small' : 'Medium')}
            </label>
          ))}
        </fieldset>
      )}
      {species?.givesSpells && (
        <AbilityPick
          label={t('Ability for your lineage’s spells')}
          from={['int', 'wis', 'cha']}
          value={draft.speciesAbility ?? null}
          onChange={(ability) => {
            update({ speciesAbility: ability as 'int' | 'wis' | 'cha' });
          }}
        />
      )}
      {species?.originFeat && (
        <Field label={t('Another Origin feat')}>
          {(id) => (
            <select
              id={id}
              value={draft.originFeat ?? ''}
              onChange={(event) => {
                update({ originFeat: event.target.value || undefined });
              }}
            >
              <option value="">{t('Choose…')}</option>
              {options.originFeats.map((feat) => (
                <option key={feat.featId} value={feat.featId}>
                  {feat.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Problems
        problems={[
          ...builder.problemsOf('speciesId'),
          // The options by their words in the table's language.
          ...builder.problemsOf('speciesOption').map((problem) =>
            species && problem.params?.['options'] !== undefined
              ? {
                  ...problem,
                  params: { options: species.options.map((option) => option.label).join(', ') },
                }
              : problem,
          ),
          ...builder.problemsOf('size'),
          ...builder.problemsOf('speciesAbility'),
          ...builder.problemsOf('originFeat'),
        ]}
      />
      <h3>{t('Background')}</h3>
      <Cards
        label={t('Background')}
        items={options.backgrounds.map((one) => ({
          id: one.backgroundId,
          lang: one.language === options.language ? undefined : one.language,
          name: one.name,
          line: `${one.abilityScores.map((ability) => t(ABILITY_NAMES[ability])).join(', ')} · ${one.feat}`,
        }))}
        chosen={draft.backgroundId}
        onChoose={(backgroundId) => {
          update({
            backgroundId,
            increases: { each: true },
            equipment: { ...draft.equipment, backgroundOption: 'A', picks: [] },
          });
        }}
      />
      {background && <Increases builder={builder} raises={background.abilityScores} />}
      <Problems
        problems={[...builder.problemsOf('backgroundId'), ...builder.problemsOf('increases')]}
      />
    </div>
  );
}

function AbilityPick({
  label,
  from,
  value,
  onChange,
}: {
  readonly label: string;
  readonly from: readonly Ability[];
  readonly value: Ability | null;
  readonly onChange: (ability: Ability) => void;
}) {
  const t = useT();
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={value ?? ''}
          onChange={(event) => {
            onChange(event.target.value as Ability);
          }}
        >
          <option value="">{t('Choose…')}</option>
          {from.map((ability) => (
            <option key={ability} value={ability}>
              {t(ABILITY_NAMES[ability])}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** The background's +2 and +1, or +1 to each of its three. */
function Increases({
  builder,
  raises,
}: {
  readonly builder: Builder;
  readonly raises: readonly Ability[];
}) {
  const t = useT();
  const ids = useId();
  const { increases } = builder.draft;
  const each = 'each' in increases;
  return (
    <fieldset className="builder-increases">
      <legend>{t('Ability increases')}</legend>
      <label>
        <input
          type="radio"
          name={`${ids}-way`}
          checked={each}
          onChange={() => {
            builder.update({ increases: { each: true } });
          }}
        />
        {t('+1 to each of the three')}
      </label>
      <label>
        <input
          type="radio"
          name={`${ids}-way`}
          checked={!each}
          onChange={() => {
            builder.update({ increases: { plus2: raises[0] ?? 'str', plus1: raises[1] ?? 'dex' } });
          }}
        />
        {t('+2 to one and +1 to another')}
      </label>
      {!('each' in increases) && (
        <div className="builder-row">
          <AbilityPick
            label="+2"
            from={raises}
            value={increases.plus2}
            onChange={(plus2) => {
              builder.update({ increases: { ...increases, plus2 } });
            }}
          />
          <AbilityPick
            label="+1"
            from={raises}
            value={increases.plus1}
            onChange={(plus1) => {
              builder.update({ increases: { ...increases, plus1 } });
            }}
          />
        </div>
      )}
    </fieldset>
  );
}

const POINT_COSTS = Object.keys(POINT_BUY_COST).map(Number);

export function AbilitiesStep({ builder }: { readonly builder: Builder }) {
  const t = useT();
  const ids = useId();
  const { abilities } = builder.draft;
  const base = abilities.base ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const spent = ABILITY_ORDER.reduce(
    (sum, ability) => sum + (POINT_BUY_COST[base[ability]] ?? 0),
    0,
  );
  const priority = abilities.priority ?? [...ABILITY_ORDER];
  const setMethod = (method: Draft['abilities']['method']) => {
    builder.update({
      abilities:
        method === 'rolled'
          ? { method, priority }
          : method === 'standard-array'
            ? { method, base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }
            : { method, base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } },
    });
  };
  const score = (ability: Ability, value: number) => {
    builder.update({ abilities: { ...abilities, base: { ...base, [ability]: value } } });
  };
  const values = abilities.method === 'standard-array' ? [...STANDARD_ARRAY] : POINT_COSTS;
  return (
    <div className="builder-step">
      <fieldset className="builder-inline">
        <legend>{t('Scores by')}</legend>
        {(
          [
            ['standard-array', 'The standard array'],
            ['point-buy', 'Point buy'],
            ['rolled', 'The World Engine’s rolls'],
          ] as const
        ).map(([method, label]) => (
          <label key={method}>
            <input
              type="radio"
              name={`${ids}-method`}
              checked={abilities.method === method}
              onChange={() => {
                setMethod(method);
              }}
            />
            {t(label)}
          </label>
        ))}
      </fieldset>
      {abilities.method === 'rolled' ? (
        <div className="builder-rank">
          <p className="muted">
            {t(
              'The World Engine rolls 4d6 six times and drops each lowest die when the character is made; the highest goes to the ability ranked first.',
            )}
          </p>
          <ol>
            {priority.map((ability, index) => (
              <li key={ability}>
                <span>{t(ABILITY_NAMES[ability])}</span>
                <button
                  type="button"
                  className="builder-move"
                  disabled={index === 0}
                  aria-label={t('Rank {ability} higher', { ability: t(ABILITY_NAMES[ability]) })}
                  onClick={() => {
                    const next = [...priority];
                    next.splice(index - 1, 0, ...next.splice(index, 1));
                    builder.update({ abilities: { method: 'rolled', priority: next } });
                  }}
                >
                  ↑
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="builder-scores">
          {ABILITY_ORDER.map((ability) => (
            <Field key={ability} label={t(ABILITY_NAMES[ability])}>
              {(id) => (
                <select
                  id={id}
                  value={base[ability]}
                  onChange={(event) => {
                    score(ability, Number(event.target.value));
                  }}
                >
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {`${String(value)} (${signed(Math.floor((value - 10) / 2))})`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ))}
        </div>
      )}
      {abilities.method === 'point-buy' && (
        <p className={spent > POINT_BUY_BUDGET ? 'builder-over' : 'muted'}>
          {t('{spent} of {budget} points spent', { spent, budget: POINT_BUY_BUDGET })}
        </p>
      )}
      <Problems problems={builder.problemsOf('abilities')} />
    </div>
  );
}
