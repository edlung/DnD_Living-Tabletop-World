import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, type Ability } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { ABILITY_NAMES, ABILITY_ORDER, signed } from '../character/words.ts';
import { Field, Problems } from './builder-fields.tsx';
import type { Builder, Draft } from './use-builder.ts';

/**
 * The builder's ability scores (docs/adr/0056-characters-from-the-srd.md §2): the standard array,
 * point buy within its budget, or the World Engine's rolls given to the abilities ranked.
 */
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
