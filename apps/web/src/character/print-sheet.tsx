import type {
  CharacterDerived,
  CharacterSheetResponse,
  InventoryResponse,
  Skill,
} from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { WorldApi } from '../api/client.ts';
import { APPLIED_WORDS, RESOURCE_NAMES } from './feature-words.ts';
import {
  ABILITY_NAMES,
  ABILITY_ORDER,
  classLine,
  diceWords,
  signed,
  skillName,
  spellLevelWords,
} from './words.ts';

/**
 * A character's sheet on paper (docs/adr/0056-characters-from-the-srd.md §5): its numbers, saves
 * and skills, attacks, spellcasting, class features, what it knows and what it carries, in plain
 * ink for a printer — the server's numbers only, as the dialog shows them. The control reads the
 * pack, lays the sheet beside the page for the printer alone, and opens the browser's print.
 */
export function PrintSection({
  api,
  entityId,
  value,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  readonly value: CharacterSheetResponse;
}) {
  const t = useT();
  const [pack, setPack] = useState<InventoryResponse | null | 'reading' | 'off'>('off');
  const [failed, setFailed] = useState(false);
  // The sheet is laid out once its pack is read; the browser prints it, then it goes.
  useEffect(() => {
    if (pack === 'off' || pack === 'reading') return;
    const done = () => {
      setPack('off');
    };
    window.addEventListener('afterprint', done);
    const frame = requestAnimationFrame(() => {
      window.print();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [pack]);
  return (
    <section className="hero-section print-section" aria-labelledby="hero-print-title">
      <h3 id="hero-print-title">{t('On paper')}</h3>
      <p className="muted">
        {t(
          'The whole sheet in plain ink: numbers, skills, attacks, spells, features and the pack.',
        )}
      </p>
      <div className="action-row">
        <button
          type="button"
          disabled={pack === 'reading'}
          onClick={() => {
            setFailed(false);
            setPack('reading');
            api
              .get<InventoryResponse>(
                `entities/${encodeURIComponent(entityId)}/inventory`,
                new AbortController().signal,
              )
              .then(setPack)
              .catch(() => {
                // The sheet prints without its pack rather than not at all.
                setFailed(true);
                setPack(null);
              });
          }}
        >
          {t(pack === 'reading' ? 'Preparing the sheet…' : 'Print the sheet')}
        </button>
      </div>
      {failed && (
        <p role="status">{t('The pack could not be read: the sheet prints without it.')}</p>
      )}
      {pack !== 'off' &&
        pack !== 'reading' &&
        value.derived &&
        createPortal(
          <PrintSheet value={value} derived={value.derived} pack={pack} />,
          document.body,
        )}
    </section>
  );
}

function PrintSheet({
  value,
  derived,
  pack,
}: {
  readonly value: CharacterSheetResponse;
  readonly derived: CharacterDerived;
  readonly pack: InventoryResponse | null;
}) {
  const t = useT();
  const { sheet } = value;
  const known = derived.proficiencies;
  const skills = Object.entries(derived.skills) as [Skill, CharacterDerived['skills'][Skill]][];
  const levels = [...new Set(derived.spells.map((spell) => spell.level))].sort((a, b) => a - b);
  return (
    <article className="print-sheet">
      <header>
        <h1>{value.entity.name}</h1>
        <p>
          {[
            classLine(t, sheet.classes),
            t('Level {level}', { level: derived.level }),
            known.species,
            known.background,
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </p>
      </header>
      <dl className="print-vitals">
        {[
          [t('Hit points'), String(sheet.hitPoints.max)],
          [t('Armor Class'), String(sheet.armorClass)],
          [t('Speed'), t('{feet} ft', { feet: derived.speedFt })],
          [t('Initiative'), signed(derived.initiative)],
          [t('Proficiency'), signed(derived.proficiencyBonus)],
          [t('Passive Perception'), String(derived.passive.perception)],
        ].map(([label, number]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{number}</dd>
          </div>
        ))}
      </dl>
      <table className="print-abilities">
        <thead>
          <tr>
            <th scope="col">{t('Ability')}</th>
            <th scope="col">{t('Score')}</th>
            <th scope="col">{t('Modifier')}</th>
            <th scope="col">{t('Save')}</th>
          </tr>
        </thead>
        <tbody>
          {ABILITY_ORDER.map((ability) => {
            const entry = derived.abilities[ability];
            return (
              <tr key={ability}>
                <th scope="row">{t(ABILITY_NAMES[ability])}</th>
                <td>{entry.score}</td>
                <td>{signed(entry.modifier)}</td>
                <td>{`${signed(entry.save)}${entry.saveProficient ? ' ●' : ''}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <section>
        <h2>{t('Skills')}</h2>
        <ul className="print-columns">
          {skills
            .sort(([a], [b]) => skillName(t, a).localeCompare(skillName(t, b)))
            .map(([skill, entry]) => (
              <li key={skill}>
                {`${entry.proficiency === 'expertise' ? '●● ' : entry.proficiency === 'proficient' ? '● ' : ''}${skillName(t, skill)} ${signed(entry.total)}`}
              </li>
            ))}
        </ul>
      </section>
      {derived.attacks.length > 0 && (
        <section>
          <h2>{t('Attacks')}</h2>
          <ul>
            {derived.attacks.map((attack) => (
              <li key={attack.weaponId}>
                {`${readableLabel(attack.weaponId, t)}: ${signed(attack.attackBonus)}, ${diceWords(attack.damage)} ${t(readableLabel(attack.damageType))}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {derived.spellcasting.length > 0 && (
        <section>
          <h2>{t('Spellcasting')}</h2>
          <ul>
            {derived.spellcasting.map((source) => (
              <li key={source.source}>
                {t('{source} ({ability}): save DC {dc}, attack {bonus}', {
                  source: readableLabel(source.source, t),
                  ability: t(ABILITY_NAMES[source.ability]),
                  dc: source.saveDc,
                  bonus: signed(source.attackBonus),
                })}
              </li>
            ))}
          </ul>
          {levels.map((level) => (
            <p key={level}>
              <strong>{spellLevelWords(t, level)}: </strong>
              {derived.spells
                .filter((spell) => spell.level === level)
                .map((spell) => spell.name)
                .join(', ')}
            </p>
          ))}
        </section>
      )}
      {(derived.resources.length > 0 || derived.applied.length > 0) && (
        <section>
          <h2>{t('Class features')}</h2>
          <ul>
            {derived.resources.map((one) => (
              <li key={one.resource}>
                {t('{name}: {left} of {max}', {
                  name: t(RESOURCE_NAMES[one.resource]),
                  left: one.left,
                  max: one.max,
                })}
              </li>
            ))}
            {derived.applied.map((one) => (
              <li key={one.feature}>
                {t(APPLIED_WORDS[one.feature], { amount: one.amount ?? 0 })}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>{t('Origin, tools and languages')}</h2>
        <ul>
          {known.feats.length > 0 && <li>{`${t('Feats')}: ${known.feats.join(', ')}`}</li>}
          {known.tools.length > 0 && <li>{`${t('Tools')}: ${known.tools.join(', ')}`}</li>}
          {known.languages.length > 0 && (
            <li>{`${t('Languages')}: ${known.languages.join(', ')}`}</li>
          )}
        </ul>
      </section>
      {pack && pack.items.length > 0 && (
        <section>
          <h2>{t('Equipment')}</h2>
          <ul className="print-columns">
            {pack.items.map((item) => (
              <li key={item.itemId}>
                {item.quantity > 1 ? `${String(item.quantity)} × ${item.name}` : item.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
