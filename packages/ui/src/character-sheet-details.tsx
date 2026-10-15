import type { Ability, CharacterSheet } from '@ltw/contracts';

import { readableLabel, readableList } from './labels.ts';
import { useT } from './i18n.tsx';

const abilityLabels: Readonly<Record<Ability, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export interface CharacterSheetDetailsProps {
  readonly sheet: CharacterSheet;
  readonly name: string;
}

/** Every sheet field stays reachable; the server remains the source of rule values. */
export function CharacterSheetDetails({ sheet, name }: CharacterSheetDetailsProps) {
  const t = useT();
  return (
    <section className="character-sheet" aria-label={t('Character sheet')}>
      <div className="detail-stack">
        <h3>{name}</h3>
        <dl className="stat-grid">
          <div>
            <dt>{t('Hit points')}</dt>
            <dd>
              {sheet.hitPoints.current} / {sheet.hitPoints.max}
            </dd>
          </div>
          <div>
            <dt>{t('Armor class')}</dt>
            <dd>{sheet.armorClass}</dd>
          </div>
          <div>
            <dt>{t('Speed')}</dt>
            <dd>{t('{feet} ft', { feet: sheet.speedFt })}</dd>
          </div>
        </dl>

        <details className="disclosure" open>
          <summary>{t('Classes and abilities')}</summary>
          <ul>
            {sheet.classes.map((entry, index) => (
              <li key={`${entry.classId}-${index}`}>
                {readableLabel(entry.classId, t)} {entry.level}
                {entry.subclass ? ` · ${entry.subclass}` : ''}
              </li>
            ))}
          </ul>
          <dl className="stat-grid">
            {Object.entries(abilityLabels).map(([ability, label]) => (
              <div key={ability}>
                <dt>{t(label)}</dt>
                <dd>{sheet.abilities[ability as Ability]}</dd>
              </div>
            ))}
          </dl>
        </details>

        <details className="disclosure">
          <summary>{t('Proficiencies and attacks')}</summary>
          <dl className="field-list">
            <div>
              <dt>{t('Saving throw proficiencies')}</dt>
              <dd>
                {sheet.savingThrows.map((ability) => t(abilityLabels[ability])).join(', ') ||
                  t('None recorded')}
              </dd>
            </div>
            <div>
              <dt>{t('Skill proficiencies')}</dt>
              <dd>{readableList(sheet.skills.proficient, t)}</dd>
            </div>
            <div>
              <dt>{t('Expertise')}</dt>
              <dd>{readableList(sheet.skills.expertise, t)}</dd>
            </div>
            <div>
              <dt>{t('Fighting style')}</dt>
              <dd>
                {sheet.fightingStyle ? readableLabel(sheet.fightingStyle, t) : t('None recorded')}
              </dd>
            </div>
            <div>
              <dt>{t('Attacks per action')}</dt>
              <dd>{sheet.attacksPerAction}</dd>
            </div>
            <div>
              <dt>{t('Weapons')}</dt>
              <dd>{readableList(sheet.weapons, t)}</dd>
            </div>
          </dl>
        </details>

        <details className="disclosure">
          <summary>{t('Spell slots')}</summary>
          <table className="data-table">
            <caption>{t('Spell slots by level')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('Level')}</th>
                <th scope="col">{t('Maximum')}</th>
                <th scope="col">{t('Expended')}</th>
              </tr>
            </thead>
            <tbody>
              {sheet.spellSlots.max.map((maximum, index) => (
                <tr key={index}>
                  <th scope="row">{index + 1}</th>
                  <td>{maximum}</td>
                  <td>{sheet.spellSlots.expended[index]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <details className="disclosure">
          <summary>{t('Spellcasting sources and free casts')}</summary>
          {sheet.spellcasting.length === 0 ? <p>{t('No spellcasting sources recorded.')}</p> : null}
          <ul className="record-list">
            {sheet.spellcasting.map((source, index) => (
              <li key={`${source.source}-${index}`}>
                <h4>{readableLabel(source.source, t)}</h4>
                <dl className="field-list">
                  <div>
                    <dt>{t('Spellcasting ability')}</dt>
                    <dd>{abilityLabels[source.ability]}</dd>
                  </div>
                  <div>
                    <dt>{t('Spells')}</dt>
                    <dd>{readableList(source.spells, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('Free casts')}</dt>
                    <dd>
                      {source.freeCasts ? (
                        <>
                          {t('{spell}: {used} used / {total} per Long Rest', {
                            spell: readableLabel(source.freeCasts.spellId, t),
                            used: source.freeCasts.used,
                            total: source.freeCasts.perLongRest,
                          })}
                        </>
                      ) : (
                        t('None recorded')
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </details>

        <details className="disclosure">
          <summary>{t('Conditions, concentration and death saves')}</summary>
          <dl className="field-list">
            <div>
              <dt>{t('Conditions')}</dt>
              <dd>{readableList(sheet.conditions, t)}</dd>
            </div>
            <div>
              <dt>{t('Concentration')}</dt>
              <dd>
                {sheet.concentration
                  ? readableLabel(sheet.concentration.spellId, t)
                  : t('None recorded')}
              </dd>
            </div>
            {sheet.concentration?.targetId ? (
              <div>
                <dt>{t('Concentration target')}</dt>
                <dd>
                  <code>{sheet.concentration.targetId}</code>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{t('Death saves')}</dt>
              <dd>
                {sheet.deathSaves ? (
                  <>
                    {sheet.deathSaves.successes} successes · {sheet.deathSaves.failures} failures
                  </>
                ) : (
                  t('None recorded')
                )}
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
