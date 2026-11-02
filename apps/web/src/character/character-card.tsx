import type { CharacterDerived, CharacterSheet, EntityKind, PlayerAssetView } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';

import { CONDITION_EFFECTS, exhaustionWords } from '../combat/condition-words.ts';
import { Glyph } from '../visual/glyph.tsx';
import { Medallion } from '../visual/medallion.tsx';
import type { GlyphName } from '../visual/ui-kit-names.ts';
import { classLine, signed } from './words.ts';

/** The share of hit points left, as a bar width (drawn markup, not a picture). */
const share = (current: number, max: number) =>
  `${String(Math.max(0, Math.min(100, (100 * current) / Math.max(1, max))))}%`;

function Vital({
  glyph,
  label,
  value,
  className,
}: {
  readonly glyph: GlyphName;
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <div className={className ? `hero-vital ${className}` : 'hero-vital'}>
      <dt>
        <Glyph name={glyph} />
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * A character's card (Stage 500): the approved portrait in the GPT ring, the name, the class line
 * and the vitals people look for first — hit points with a bar, armor class, speed, initiative and
 * proficiency. Every number is the server's (sheet or `derived`).
 */
export function CharacterCard({
  titleId,
  name,
  kind,
  image,
  sheet,
  derived,
}: {
  readonly titleId: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly image: PlayerAssetView | null;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived | undefined;
}) {
  const t = useT();
  const { current, max } = sheet.hitPoints;
  const low = current * 2 <= max;
  const condition =
    current === 0
      ? sheet.deathSaves?.failures === 3
        ? 'dead'
        : 'unconscious'
      : low
        ? 'wounded'
        : null;
  return (
    <header className="hero-card">
      <div className="hero-portrait">
        <Medallion image={image} kind={kind} size="xl" condition={condition} />
        {derived && (
          <span className="hero-level" aria-hidden="true">
            {derived.level}
          </span>
        )}
      </div>
      <div className="hero-identity">
        <p className="hero-kicker">
          {derived ? t('Level {level}', { level: derived.level }) : t('Character')}
        </p>
        <h2 id={titleId} className="hero-name">
          {name}
        </h2>
        <p className="hero-classes">{classLine(t, sheet.classes)}</p>
      </div>
      <div className="hero-hp">
        <p className="hero-hp-line">
          <span className="hero-hp-label">
            <Glyph name="hit-points" />
            {t('Hit points')}
          </span>
          <span className="hero-hp-value">
            {current} <span aria-hidden="true">/</span>
            <span className="visually-hidden">{t('of')}</span> {max}
          </span>
        </p>
        <span className={`hp-bar hero-hp-bar${low ? ' hp-bar--low' : ''}`} aria-hidden="true">
          <span style={{ width: share(current, max) }} />
        </span>
      </div>
      <dl className="hero-vitals">
        <Vital glyph="armor-class" label={t('Armor class')} value={String(sheet.armorClass)} />
        <Vital
          glyph="speed"
          label={t('Speed')}
          value={t('{feet} ft', { feet: derived?.speedFt ?? sheet.speedFt })}
        />
        {derived && (
          <>
            <Vital glyph="initiative" label={t('Initiative')} value={signed(derived.initiative)} />
            <Vital glyph="roll" label={t('Proficiency')} value={signed(derived.proficiencyBonus)} />
          </>
        )}
      </dl>
      {(sheet.conditions.length > 0 || sheet.concentration || sheet.exhaustion !== undefined) && (
        <ul className="hero-states" aria-label={t('Conditions')}>
          {sheet.conditions.map((condition) => (
            <li key={condition} className="hero-state hero-state--condition">
              <Glyph name={condition} />
              {readableLabel(condition, t)}
            </li>
          ))}
          {sheet.exhaustion !== undefined && (
            <li className="hero-state hero-state--condition">
              <Glyph name="exhaustion" />
              {t('Exhaustion {level}', { level: sheet.exhaustion })}
            </li>
          )}
          {sheet.concentration && (
            <li className="hero-state hero-state--concentration">
              <Glyph name="concentration" />
              {t('Concentrating: {spell}', {
                spell: readableLabel(sheet.concentration.spellId, t),
              })}
            </li>
          )}
        </ul>
      )}
      {/* What each does, in a line (docs/adr/0045-conditions-and-actions.md §4). */}
      {(sheet.conditions.length > 0 || sheet.exhaustion !== undefined) && (
        <ul className="hero-state-effects" aria-label={t('What they do')}>
          {sheet.conditions.map((condition) => (
            <li key={condition}>
              <strong>{readableLabel(condition, t)}:</strong> {t(CONDITION_EFFECTS[condition])}
            </li>
          ))}
          {sheet.exhaustion !== undefined && <li>{exhaustionWords(t, sheet.exhaustion)}</li>}
        </ul>
      )}
    </header>
  );
}
