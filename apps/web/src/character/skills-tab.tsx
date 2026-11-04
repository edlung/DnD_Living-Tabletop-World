import type { Ability, CharacterDerived, Skill } from '@ltw/contracts';
import { useT } from '@ltw/ui';

import { RollButton, useRollFor } from './roll-buttons.tsx';
import { ABILITY_NAMES, ABILITY_ORDER, signed, skillName } from './words.ts';

const PROFICIENCY_WORDS = {
  none: 'not proficient',
  proficient: 'proficient',
  expertise: 'expertise',
} as const;

/**
 * The skills tab (Stage 500): the three passive scores, then all 18 skills grouped under their
 * ability, each with its proficiency mark (none, proficient, expertise) and total bonus; last its
 * origin, feats, tools and languages, as the server names them (docs/adr/0056-…md §2).
 */
export function SkillsTab({
  entityId,
  derived,
}: {
  readonly entityId: string;
  readonly derived: CharacterDerived;
}) {
  const t = useT();
  const roll = useRollFor(entityId);
  const entries = Object.entries(derived.skills) as [Skill, CharacterDerived['skills'][Skill]][];
  const byAbility = (ability: Ability) =>
    entries
      .filter(([, entry]) => entry.ability === ability)
      .sort(([a], [b]) => skillName(t, a).localeCompare(skillName(t, b)));
  return (
    <div className="hero-skills">
      <dl className="passive-row" aria-label={t('Passive scores')}>
        <div className="passive-score">
          <dt>{t('Passive Perception')}</dt>
          <dd>{derived.passive.perception}</dd>
        </div>
        <div className="passive-score">
          <dt>{t('Passive Investigation')}</dt>
          <dd>{derived.passive.investigation}</dd>
        </div>
        <div className="passive-score">
          <dt>{t('Passive Insight')}</dt>
          <dd>{derived.passive.insight}</dd>
        </div>
      </dl>
      <p className="field-hint">
        {t(
          'A filled mark is proficiency, a double mark expertise; the number is your bonus to the roll.',
        )}
      </p>
      <div className="skill-groups">
        {ABILITY_ORDER.map((ability) => {
          const skills = byAbility(ability);
          if (skills.length === 0) return null;
          const id = `hero-skills-${ability}`;
          return (
            <section key={ability} className="skill-group" aria-labelledby={id}>
              <h3 id={id}>
                <span>{t(ABILITY_NAMES[ability])}</span>
                <span className="skill-group-mod">
                  {signed(derived.abilities[ability].modifier)}
                </span>
              </h3>
              <ul>
                {skills.map(([skill, entry]) => (
                  <li key={skill} className={`skill-row is-${entry.proficiency}`}>
                    <span className="proficiency-mark" aria-hidden="true" />
                    <span className="skill-name">{skillName(t, skill)}</span>
                    <span className="skill-total">{signed(entry.total)}</span>
                    {roll && (
                      <RollButton
                        label={t('Roll {skill} ({bonus})', {
                          skill: skillName(t, skill),
                          bonus: signed(entry.total),
                        })}
                        onRoll={() => {
                          roll({ kind: 'skill', skill });
                        }}
                      />
                    )}
                    <span className="visually-hidden">
                      {t(PROFICIENCY_WORDS[entry.proficiency])}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Proficiencies proficiencies={derived.proficiencies} />
    </div>
  );
}

function Proficiencies({
  proficiencies,
}: {
  readonly proficiencies: CharacterDerived['proficiencies'];
}) {
  const t = useT();
  const rows = [
    ['Species', proficiencies.species === null ? [] : [proficiencies.species]],
    ['Background', proficiencies.background === null ? [] : [proficiencies.background]],
    ['Feats', proficiencies.feats],
    ['Tools', proficiencies.tools],
    ['Languages', proficiencies.languages],
  ] as const;
  const shown = rows.filter(([, values]) => values.length > 0);
  if (shown.length === 0) return null;
  return (
    <section className="skill-group hero-proficiencies" aria-labelledby="hero-proficiencies">
      <h3 id="hero-proficiencies">{t('Origin, tools and languages')}</h3>
      <dl>
        {shown.map(([label, values]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{values.join(', ')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
