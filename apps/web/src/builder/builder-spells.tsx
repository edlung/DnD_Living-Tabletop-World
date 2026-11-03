import type { CharacterOptionsResponse } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useId } from 'react';

import { ABILITY_NAMES } from '../character/words.ts';
import { Several } from './builder-choices.tsx';
import { Field, Problems } from './builder-steps.tsx';
import type { Builder } from './use-builder.ts';

/**
 * The builder's spells step (docs/adr/0056-characters-from-the-srd.md §2): the class's cantrips
 * and prepared spells from its list, a Wizard's spellbook, and Magic Initiate's two cantrips and
 * level 1 spell.
 */
export function SpellsStep({
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
  const list = (classId: string, level: number) =>
    options.spells.filter((spell) => spell.level === level && spell.classes.includes(classId));
  const nameOf = (spellId: string) =>
    options.spells.find((spell) => spell.spellId === spellId)?.name ?? spellId;
  const initiate = [background?.featId, draft.originFeat].includes('magic-initiate');
  const fixedList = /\((Cleric|Druid|Wizard)\)/.exec(background?.feat ?? '')?.[1]?.toLowerCase();
  const magic = draft.magicInitiate ?? {
    list: (fixedList ?? 'wizard') as 'cleric' | 'druid' | 'wizard',
    ability: 'int' as const,
    cantrips: [],
    spell: '',
  };
  const extra = draft.order === 'thaumaturge' || draft.order === 'magician' ? 1 : 0;
  return (
    <div className="builder-step">
      {cls?.casting ? (
        <>
          <p className="muted">
            {t('{class} casts with {ability}: {slots} spell slots at level 1.', {
              class: cls.name,
              ability: t(ABILITY_NAMES[cls.casting.ability]),
              slots: cls.casting.slots,
            })}
          </p>
          {cls.casting.cantrips + extra > 0 && (
            <Several
              legend={t('Cantrips')}
              wanted={cls.casting.cantrips + extra}
              from={list(cls.classId, 0).map((spell) => spell.spellId)}
              chosen={draft.cantrips}
              nameOf={nameOf}
              onChange={(cantrips) => {
                update({ cantrips });
              }}
            />
          )}
          {draft.classId === 'wizard' && (
            <Several
              legend={t('Your spellbook')}
              wanted={6}
              from={list('wizard', 1).map((spell) => spell.spellId)}
              chosen={draft.spellbook}
              nameOf={nameOf}
              onChange={(spellbook) => {
                update({ spellbook, spells: draft.spells.filter((id) => spellbook.includes(id)) });
              }}
            />
          )}
          <Several
            legend={t('Prepared spells')}
            wanted={cls.casting.prepared}
            from={
              draft.classId === 'wizard'
                ? draft.spellbook
                : list(cls.classId, 1).map((spell) => spell.spellId)
            }
            chosen={draft.spells}
            nameOf={nameOf}
            onChange={(spells) => {
              update({ spells });
            }}
          />
        </>
      ) : (
        <p className="muted">{t('Your class casts no spells at level 1.')}</p>
      )}
      {initiate && (
        <fieldset className="builder-several">
          <legend>{t('Magic Initiate')}</legend>
          {!fixedList && (
            <div className="builder-inline" role="radiogroup" aria-label={t('Spell list')}>
              {(['cleric', 'druid', 'wizard'] as const).map((one) => (
                <label key={one}>
                  <input
                    type="radio"
                    name={`${ids}-list`}
                    checked={magic.list === one}
                    onChange={() => {
                      update({ magicInitiate: { ...magic, list: one, cantrips: [], spell: '' } });
                    }}
                  />
                  {t(readableLabel(one))}
                </label>
              ))}
            </div>
          )}
          <Field label={t('Its spellcasting ability')}>
            {(id) => (
              <select
                id={id}
                value={magic.ability}
                onChange={(event) => {
                  update({
                    magicInitiate: {
                      ...magic,
                      ability: event.target.value as 'int' | 'wis' | 'cha',
                    },
                  });
                }}
              >
                {(['int', 'wis', 'cha'] as const).map((ability) => (
                  <option key={ability} value={ability}>
                    {t(ABILITY_NAMES[ability])}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Several
            legend={t('Its two cantrips')}
            wanted={2}
            from={list(magic.list, 0).map((spell) => spell.spellId)}
            chosen={magic.cantrips}
            nameOf={nameOf}
            onChange={(cantrips) => {
              update({ magicInitiate: { ...magic, cantrips } });
            }}
          />
          <Field label={t('Its level 1 spell')}>
            {(id) => (
              <select
                id={id}
                value={magic.spell}
                onChange={(event) => {
                  update({ magicInitiate: { ...magic, spell: event.target.value } });
                }}
              >
                <option value="">{t('Choose…')}</option>
                {list(magic.list, 1).map((spell) => (
                  <option key={spell.spellId} value={spell.spellId}>
                    {spell.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </fieldset>
      )}
      <Problems
        problems={[
          ...builder.problemsOf('cantrips'),
          ...builder.problemsOf('spells'),
          ...builder.problemsOf('spellbook'),
          ...builder.problemsOf('magicInitiate'),
        ]}
      />
    </div>
  );
}
