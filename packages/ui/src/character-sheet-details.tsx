import type { Ability, CharacterSheet } from '@ltw/contracts';

import { readableLabel, readableList } from './labels.ts';

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
  return (
    <section className="character-sheet" aria-label="Character sheet">
      <div className="detail-stack">
        <h3>{name}</h3>
        <dl className="stat-grid">
          <div>
            <dt>Hit points</dt>
            <dd>
              {sheet.hitPoints.current} / {sheet.hitPoints.max}
            </dd>
          </div>
          <div>
            <dt>Armor class</dt>
            <dd>{sheet.armorClass}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{sheet.speedFt} ft</dd>
          </div>
        </dl>

        <details className="disclosure" open>
          <summary>Classes and abilities</summary>
          <ul>
            {sheet.classes.map((entry, index) => (
              <li key={`${entry.classId}-${index}`}>
                {readableLabel(entry.classId)} {entry.level}
                {entry.subclass ? ` · ${entry.subclass}` : ''}
              </li>
            ))}
          </ul>
          <dl className="stat-grid">
            {Object.entries(abilityLabels).map(([ability, label]) => (
              <div key={ability}>
                <dt>{label}</dt>
                <dd>{sheet.abilities[ability as Ability]}</dd>
              </div>
            ))}
          </dl>
        </details>

        <details className="disclosure">
          <summary>Proficiencies and attacks</summary>
          <dl className="field-list">
            <div>
              <dt>Saving throw proficiencies</dt>
              <dd>
                {sheet.savingThrows.map((ability) => abilityLabels[ability]).join(', ') ||
                  'None recorded'}
              </dd>
            </div>
            <div>
              <dt>Skill proficiencies</dt>
              <dd>{readableList(sheet.skills.proficient)}</dd>
            </div>
            <div>
              <dt>Expertise</dt>
              <dd>{readableList(sheet.skills.expertise)}</dd>
            </div>
            <div>
              <dt>Fighting style</dt>
              <dd>{sheet.fightingStyle ? readableLabel(sheet.fightingStyle) : 'None recorded'}</dd>
            </div>
            <div>
              <dt>Attacks per action</dt>
              <dd>{sheet.attacksPerAction}</dd>
            </div>
            <div>
              <dt>Weapons</dt>
              <dd>{readableList(sheet.weapons)}</dd>
            </div>
          </dl>
        </details>

        <details className="disclosure">
          <summary>Spell slots</summary>
          <table className="data-table">
            <caption>Spell slots by level</caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Maximum</th>
                <th scope="col">Expended</th>
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
          <summary>Spellcasting sources and free casts</summary>
          {sheet.spellcasting.length === 0 ? <p>No spellcasting sources recorded.</p> : null}
          <ul className="record-list">
            {sheet.spellcasting.map((source, index) => (
              <li key={`${source.source}-${index}`}>
                <h4>{readableLabel(source.source)}</h4>
                <dl className="field-list">
                  <div>
                    <dt>Spellcasting ability</dt>
                    <dd>{abilityLabels[source.ability]}</dd>
                  </div>
                  <div>
                    <dt>Spells</dt>
                    <dd>{readableList(source.spells)}</dd>
                  </div>
                  <div>
                    <dt>Free casts</dt>
                    <dd>
                      {source.freeCasts ? (
                        <>
                          {readableLabel(source.freeCasts.spellId)}: {source.freeCasts.used} used
                          {' / '}
                          {source.freeCasts.perLongRest} per Long Rest
                        </>
                      ) : (
                        'None recorded'
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </details>

        <details className="disclosure">
          <summary>Conditions, concentration and death saves</summary>
          <dl className="field-list">
            <div>
              <dt>Conditions</dt>
              <dd>{readableList(sheet.conditions)}</dd>
            </div>
            <div>
              <dt>Concentration</dt>
              <dd>
                {sheet.concentration ? readableLabel(sheet.concentration.spellId) : 'None recorded'}
              </dd>
            </div>
            {sheet.concentration?.targetId ? (
              <div>
                <dt>Concentration target</dt>
                <dd>
                  <code>{sheet.concentration.targetId}</code>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Death saves</dt>
              <dd>
                {sheet.deathSaves ? (
                  <>
                    {sheet.deathSaves.successes} successes · {sheet.deathSaves.failures} failures
                  </>
                ) : (
                  'None recorded'
                )}
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
