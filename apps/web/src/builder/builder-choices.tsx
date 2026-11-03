import {
  SKILL_IDS,
  type CharacterOptionsResponse,
  type OptionEquipment,
  type Skill,
  type WeaponId,
} from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useId } from 'react';

import { skillName } from '../character/words.ts';
import { Field, Problems } from './builder-steps.tsx';
import type { Builder, Draft } from './use-builder.ts';

/**
 * The builder's later steps (docs/adr/0056-characters-from-the-srd.md §2): skills, tools and the
 * class's level 1 choices; the starting equipment; the spells.
 */

/** Checkboxes for a number of things out of a list; the rest are disabled once enough are on. */
export function Several<T extends string>({
  legend,
  wanted,
  from,
  chosen,
  nameOf,
  onChange,
  lang,
}: {
  readonly legend: string;
  readonly wanted: number;
  readonly from: readonly T[];
  readonly chosen: readonly T[];
  readonly nameOf: (id: T) => string;
  readonly onChange: (next: T[]) => void;
  readonly lang?: string | undefined;
}) {
  const t = useT();
  const full = chosen.length >= wanted;
  return (
    <fieldset className="builder-several">
      <legend>
        {legend}{' '}
        <span className="muted">
          {t('{chosen} of {wanted}', { chosen: chosen.length, wanted })}
        </span>
      </legend>
      <div className="builder-checks" lang={lang}>
        {from.map((id) => {
          const on = chosen.includes(id);
          return (
            <label key={id}>
              <input
                type="checkbox"
                checked={on}
                disabled={!on && full}
                onChange={() => {
                  onChange(on ? chosen.filter((one) => one !== id) : [...chosen, id]);
                }}
              />
              {nameOf(id)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SkillsStep({
  options,
  builder,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
}) {
  const t = useT();
  const { draft, update } = builder;
  const cls = options.classes.find((one) => one.classId === draft.classId);
  const species = options.species.find((one) => one.speciesId === draft.speciesId);
  const background = options.backgrounds.find((one) => one.backgroundId === draft.backgroundId);
  if (!cls || !background)
    return <p className="muted">{t('Choose a class and a background first.')}</p>;
  const fixed = new Set<Skill>(background.skills);
  const feats = [background.featId, draft.originFeat];
  const skilled = feats.filter((feat) => feat === 'skilled').length * 3;
  const speciesCount = species?.skillChoice?.count ?? 0;
  const toolPicks = [cls.tools.pick, background.tools.pick].filter((pick) => pick !== null);
  // The class's words are English until their translation exists.
  const english = cls.language === options.language ? undefined : cls.language;
  const proficient = [...fixed, ...draft.skills, ...draft.moreSkills];
  return (
    <div className="builder-step">
      <p className="muted">
        {t('Your background gives {skills}.', {
          skills: background.skills.map((skill) => skillName(t, skill)).join(', '),
        })}
      </p>
      <Several
        legend={t('Class skills')}
        wanted={cls.skills.choose}
        from={cls.skills.from.filter((skill) => !fixed.has(skill))}
        chosen={draft.skills}
        nameOf={(skill) => skillName(t, skill)}
        onChange={(skills) => {
          update({ skills, expertise: [] });
        }}
      />
      {speciesCount + skilled > 0 && (
        <Several
          legend={t('Skills your species or feat gives')}
          wanted={speciesCount + skilled}
          from={(skilled > 0 ? [...SKILL_IDS] : (species?.skillChoice?.from ?? [])).filter(
            (skill) => !fixed.has(skill) && !draft.skills.includes(skill),
          )}
          chosen={draft.moreSkills}
          nameOf={(skill) => skillName(t, skill)}
          onChange={(moreSkills) => {
            update({ moreSkills });
          }}
        />
      )}
      {draft.classId === 'rogue' && (
        <Several
          legend={t('Expertise')}
          wanted={2}
          from={proficient}
          chosen={draft.expertise}
          nameOf={(skill) => skillName(t, skill)}
          onChange={(expertise) => {
            update({ expertise });
          }}
        />
      )}
      {toolPicks.map((pick) => (
        <Several
          key={pick.kind}
          legend={t('Tools')}
          wanted={pick.count}
          from={pick.from.map((one) => one.catalogId)}
          chosen={draft.tools.filter((tool) => pick.from.some((one) => one.catalogId === tool))}
          nameOf={(id) => pick.from.find((one) => one.catalogId === id)?.name ?? id}
          onChange={(next) => {
            const others = draft.tools.filter(
              (tool) => !pick.from.some((one) => one.catalogId === tool),
            );
            update({ tools: [...others, ...next] });
          }}
        />
      ))}
      <Problems
        problems={[
          ...builder.problemsOf('skills'),
          ...builder.problemsOf('moreSkills'),
          ...builder.problemsOf('expertise'),
          ...builder.problemsOf('tools'),
        ]}
      />
      <ClassChoices options={options} builder={builder} lang={english} />
    </div>
  );
}

/** A Fighter's style, a Cleric's or a Druid's order, a Warlock's invocation, weapon masteries. */
function ClassChoices({
  options,
  builder,
  lang,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
  readonly lang: string | undefined;
}) {
  const t = useT();
  const ids = useId();
  const { draft, update } = builder;
  const cls = options.classes.find((one) => one.classId === draft.classId);
  if (!cls) return null;
  return (
    <>
      {cls.fightingStyle && (
        <fieldset className="builder-inline">
          <legend>{t('Fighting style')}</legend>
          {options.fightingStyles.map((style) => (
            <label key={style.featId} lang={lang}>
              <input
                type="radio"
                name={`${ids}-style`}
                checked={draft.fightingStyle === style.featId}
                onChange={() => {
                  update({ fightingStyle: style.featId });
                }}
              />
              {style.name}
            </label>
          ))}
        </fieldset>
      )}
      {cls.orders.length > 0 && (
        <fieldset className="builder-inline">
          <legend>{t(draft.classId === 'cleric' ? 'Divine Order' : 'Primal Order')}</legend>
          {cls.orders.map((order) => (
            <label key={order}>
              <input
                type="radio"
                name={`${ids}-order`}
                checked={draft.order === order}
                onChange={() => {
                  update({ order, cantrips: [] });
                }}
              />
              {t(readableLabel(order))}
            </label>
          ))}
        </fieldset>
      )}
      {cls.invocations.length > 0 && (
        <Field label={t('Eldritch Invocation')}>
          {(id) => (
            <select
              id={id}
              value={draft.invocations[0] ?? ''}
              onChange={(event) => {
                update({ invocations: event.target.value ? [event.target.value] : [] });
              }}
            >
              <option value="">{t('Choose…')}</option>
              {cls.invocations.map((one) => (
                <option key={one.optionId} value={one.optionId} lang={lang}>
                  {one.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {cls.masteries > 0 && (
        <Several<WeaponId>
          legend={t('Weapon Mastery')}
          wanted={cls.masteries}
          from={options.weapons.map((one) => one.weaponId)}
          chosen={draft.weaponMasteries}
          nameOf={(id) => options.weapons.find((one) => one.weaponId === id)?.name ?? id}
          onChange={(weaponMasteries) => {
            update({ weaponMasteries });
          }}
        />
      )}
      <Problems
        problems={[
          ...builder.problemsOf('fightingStyle'),
          ...builder.problemsOf('order'),
          ...builder.problemsOf('invocations'),
          ...builder.problemsOf('weaponMasteries'),
        ]}
      />
    </>
  );
}

function OptionWords({ option }: { readonly option: OptionEquipment }) {
  const t = useT();
  const items = option.items.map((item) =>
    item.quantity > 1 ? `${String(item.quantity)} × ${item.name}` : item.name,
  );
  const picks = option.picks.map(() => t('one of your choice'));
  return <>{[...items, ...picks, t('{gp} gold', { gp: option.gp })].join(', ')}</>;
}

export function EquipmentStep({
  options,
  builder,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
}) {
  const t = useT();
  const ids = useId();
  const { draft, update } = builder;
  const cls = options.classes.find((one) => one.classId === draft.classId);
  const background = options.backgrounds.find((one) => one.backgroundId === draft.backgroundId);
  if (!cls || !background)
    return <p className="muted">{t('Choose a class and a background first.')}</p>;
  const classOption = cls.equipment.find((one) => one.label === draft.equipment.classOption);
  const backgroundOption = background.equipment.find(
    (one) => one.label === draft.equipment.backgroundOption,
  );
  const picks = [...(classOption?.picks ?? []), ...(backgroundOption?.picks ?? [])];
  const choose = (
    which: 'classOption' | 'backgroundOption',
    label: Draft['equipment']['classOption'],
  ) => {
    update({ equipment: { ...draft.equipment, [which]: label, picks: [] } });
  };
  return (
    <div className="builder-step">
      {(
        [
          ['classOption', cls.equipment, t('From your class')],
          ['backgroundOption', background.equipment, t('From your background')],
        ] as const
      ).map(([which, offered, legend]) => (
        <fieldset key={which} className="builder-options">
          <legend>{legend}</legend>
          {offered.map((option) => (
            <label key={option.label}>
              <input
                type="radio"
                name={`${ids}-${which}`}
                checked={draft.equipment[which] === option.label}
                onChange={() => {
                  choose(which, option.label);
                }}
              />
              <span>
                <strong>{option.label}</strong> <OptionWords option={option} />
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      {picks.map((pick, index) => (
        <Field key={`${pick.kind}-${String(index)}`} label={t(readableLabel(pick.kind))}>
          {(id) => (
            <select
              id={id}
              value={draft.equipment.picks[index] ?? ''}
              onChange={(event) => {
                const next = [...draft.equipment.picks];
                next[index] = event.target.value;
                update({ equipment: { ...draft.equipment, picks: next } });
              }}
            >
              <option value="">{t('Choose…')}</option>
              {pick.from.map((one) => (
                <option key={one.catalogId} value={one.catalogId}>
                  {one.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ))}
      <Problems problems={builder.problemsOf('equipment')} />
    </div>
  );
}
