import type { CharacterDerived, CharacterSheet } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';

import { Glyph } from '../visual/glyph.tsx';
import { catalogUrl, schoolArtUrl } from '../visual/ui-kit.ts';
import {
  ABILITY_NAMES,
  sliceSpellText,
  castingTimeWords,
  rangeWords,
  signed,
  spellLevelWords,
  spellName,
} from './words.ts';

/** Spell slots by level as pips: a lit pip is a slot still available. */
function Slots({ sheet }: { readonly sheet: CharacterSheet }) {
  const t = useT();
  const levels = sheet.spellSlots.max
    .map((max, index) => ({ level: index + 1, max, used: sheet.spellSlots.expended[index] ?? 0 }))
    .filter((row) => row.max > 0);
  if (levels.length === 0) return null;
  return (
    <section className="hero-section" aria-labelledby="hero-slots">
      <h3 id="hero-slots">{t('Spell slots')}</h3>
      <ul className="slot-rows">
        {levels.map(({ level, max, used }) => (
          <li key={level} className="slot-row">
            <span className="slot-level">{t('Slot level {level}', { level })}</span>
            <span className="slot-pips" aria-hidden="true">
              {Array.from({ length: max }, (_, index) => (
                <span key={index} className={`slot-pip${index < max - used ? ' is-open' : ''}`} />
              ))}
            </span>
            <span className="slot-count">
              {t('{left} of {total} left', { left: max - used, total: max })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The spells tab (Stage 500): each casting source with its ability, save DC and attack bonus,
 * the slots left by level, and a card for every spell the sheet lists — its catalog art, rule
 * data from the server and what it does in the project's words.
 */
export function SpellsTab({
  sheet,
  derived,
}: {
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
}) {
  const t = useT();
  if (derived.spellcasting.length === 0)
    return <p className="muted">{t('This character casts no spells.')}</p>;
  return (
    <div className="hero-spells">
      <section className="hero-section" aria-labelledby="hero-casting">
        <h3 id="hero-casting">{t('Spellcasting')}</h3>
        <ul className="casting-sources">
          {derived.spellcasting.map((source) => (
            <li key={source.source} className="casting-source">
              <span className="casting-name">{readableLabel(source.source, t)}</span>
              <span className="casting-ability">{t(ABILITY_NAMES[source.ability])}</span>
              <span className="casting-stat">{t('Save DC {dc}', { dc: source.saveDc })}</span>
              <span className="casting-stat">
                {t('Spell attack {bonus}', { bonus: signed(source.attackBonus) })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Slots sheet={sheet} />
      <section className="hero-section" aria-labelledby="hero-spell-list">
        <h3 id="hero-spell-list">{t('Spells')}</h3>
        <ul className="spell-cards">
          {derived.spells.map((spell) => {
            const art = catalogUrl('spells', spell.spellId) ?? schoolArtUrl(spell.school);
            return (
              <li key={spell.spellId} className="spell-card">
                <div className="spell-art">
                  {/* An SRD spell's GPT picture comes with Stage 650e; its glyph until then. */}
                  {art ? <img src={art} alt="" /> : <Glyph name="cast" />}
                </div>
                <div className="spell-body">
                  <h4>{spellName(t, spell.spellId, spell.name)}</h4>
                  <p className="spell-meta">
                    {spellLevelWords(t, spell.level)} · {castingTimeWords(t, spell.castingTime)} ·{' '}
                    {rangeWords(t, spell.range)} ·{' '}
                    {spell.components.map((part) => t(part)).join(', ')}
                  </p>
                  {spell.concentration && (
                    <p className="spell-tag">
                      <Glyph name="concentration" />
                      {t('Concentration')}
                    </p>
                  )}
                  {spell.ritual && (
                    <p className="spell-tag">{t('Ritual: no slot, outside a fight')}</p>
                  )}
                  {sliceSpellText(spell.spellId) !== null && (
                    <p className="spell-text">{t(sliceSpellText(spell.spellId) ?? '')}</p>
                  )}
                  {spell.text?.split('\n').map((paragraph) => (
                    <p key={paragraph} className="spell-text" lang={spell.textLanguage ?? 'en'}>
                      {paragraph}
                    </p>
                  ))}
                  {spell.forDm && (
                    <p className="spell-note">
                      {spell.forDm === 'effect'
                        ? t('The DM decides what this spell does.')
                        : t('The server rolls its dice; the DM applies the rest.')}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
