import type { AmmunitionKind, CharacterDerived, CharacterSheet } from '@ltw/contracts';
import { readableLabel, useT, type Translate } from '@ltw/ui';
import type { ReactNode } from 'react';

import { masteryName } from '../combat/weapon-words.ts';
import { Glyph } from '../visual/glyph.tsx';
import { weaponArtUrl } from '../visual/ui-kit.ts';
import { RollButton, useRollFor } from './roll-buttons.tsx';
import { ABILITY_NAMES, ABILITY_ORDER, ABILITY_SHORT, diceWords, signed } from './words.ts';

/** The six abilities as tiles: the modifier large, the score and the saving throw beneath. */
function Abilities({
  entityId,
  derived,
}: {
  readonly entityId: string;
  readonly derived: CharacterDerived;
}) {
  const t = useT();
  const roll = useRollFor(entityId);
  return (
    <section className="hero-section" aria-labelledby="hero-abilities">
      <h3 id="hero-abilities">{t('Abilities and saving throws')}</h3>
      <ul className="ability-grid">
        {ABILITY_ORDER.map((ability) => {
          const entry = derived.abilities[ability];
          return (
            <li key={ability} className="ability-tile">
              <span className="ability-short" aria-hidden="true">
                {t(ABILITY_SHORT[ability])}
              </span>
              <span className="ability-mod" aria-hidden="true">
                {signed(entry.modifier)}
              </span>
              <span className="ability-score" aria-hidden="true">
                {entry.score}
              </span>
              <span
                className={`ability-save${entry.saveProficient ? ' is-proficient' : ''}`}
                aria-hidden="true"
              >
                <span className="proficiency-mark" />
                {t('Save {bonus}', { bonus: signed(entry.save) })}
              </span>
              <span className="visually-hidden">
                {t('{ability} {score}, modifier {modifier}, saving throw {save}', {
                  ability: t(ABILITY_NAMES[ability]),
                  score: entry.score,
                  modifier: signed(entry.modifier),
                  save: signed(entry.save),
                })}
                {entry.saveProficient ? ` · ${t('proficient')}` : ''}
              </span>
              {roll && (
                <span className="ability-rolls">
                  <RollButton
                    text="Check"
                    label={t('Roll a {ability} check ({bonus})', {
                      ability: t(ABILITY_NAMES[ability]),
                      bonus: signed(entry.modifier),
                    })}
                    onRoll={() => {
                      roll({ kind: 'ability', ability });
                    }}
                  />
                  <RollButton
                    text="Save"
                    label={t('Roll a {ability} saving throw ({bonus})', {
                      ability: t(ABILITY_NAMES[ability]),
                      bonus: signed(entry.save),
                    })}
                    onRoll={() => {
                      roll({ kind: 'save', ability });
                    }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What each fighting style does, in words. */
const STYLE_EFFECT: Readonly<Record<NonNullable<CharacterSheet['fightingStyle']>, string>> = {
  archery: '+2 to ranged weapon attacks',
};

const featureLines = (t: Translate, sheet: CharacterSheet): string[] => {
  const lines: string[] = [];
  if (sheet.fightingStyle) {
    lines.push(
      `${t('Fighting style: {style}', { style: readableLabel(sheet.fightingStyle, t) })} — ${t(STYLE_EFFECT[sheet.fightingStyle])}`,
    );
  }
  if (sheet.attacksPerAction > 1) {
    lines.push(
      t('Extra Attack: {count} attacks with the Attack action', { count: sheet.attacksPerAction }),
    );
  }
  for (const source of sheet.spellcasting) {
    if (source.freeCasts) {
      lines.push(
        t('{spell} without a slot: {left} of {total} until a long rest', {
          spell: readableLabel(source.freeCasts.spellId, t),
          left: source.freeCasts.perLongRest - source.freeCasts.used,
          total: source.freeCasts.perLongRest,
        }),
      );
    }
  }
  return lines;
};

/** Weapon attacks with their numbers, and the features the sheet records. */
function Combat({
  sheet,
  derived,
}: {
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
}) {
  const t = useT();
  const features = featureLines(t, sheet);
  return (
    <section className="hero-section" aria-labelledby="hero-combat">
      <h3 id="hero-combat">{t('Attacks and features')}</h3>
      {derived.attacks.length === 0 ? (
        <p className="muted">{t('No weapon attacks are recorded.')}</p>
      ) : (
        <ul className="attack-list">
          {derived.attacks.map((attack) => {
            // Its catalog or item picture; without one a glyph keeps the picture's column.
            const art = weaponArtUrl(attack.weaponId);
            const damage = diceWords(attack.damage);
            return (
              <li key={attack.weaponId} className="attack-row">
                {art ? (
                  <img className="attack-art" src={art} alt="" />
                ) : (
                  <span className="attack-art attack-art-blank">
                    <Glyph name={attack.ranged ? 'ranged' : 'melee'} />
                  </span>
                )}
                <span className="attack-name">
                  {readableLabel(attack.weaponId, t)}
                  {extraWords(t, attack) && (
                    <small className="attack-extra">{extraWords(t, attack)}</small>
                  )}
                </span>
                <span className="attack-stat">
                  <span className="attack-label">{t('To hit')}</span>
                  <strong>{signed(attack.attackBonus)}</strong>
                </span>
                <span className="attack-stat">
                  <span className="attack-label">{t('Damage')}</span>
                  <strong>
                    {damage}{' '}
                    <span className="attack-type">{t(readableLabel(attack.damageType))}</span>
                  </strong>
                </span>
                <span className="attack-stat">
                  <span className="attack-label">{t('Range')}</span>
                  <strong>
                    {attack.ranged
                      ? t('{normal}/{long} ft', {
                          normal: attack.normalRangeFt,
                          long: attack.longRangeFt,
                        })
                      : t('{feet} ft', { feet: attack.normalRangeFt })}
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {features.length > 0 && (
        <ul className="feature-list">
          {features.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Death saving throws while the character is down (ADR 0015 §4). */
function DeathSaves({ saves }: { readonly saves: NonNullable<CharacterSheet['deathSaves']> }) {
  const t = useT();
  const marks = (count: number, kind: string) =>
    Array.from({ length: 3 }, (_, index) => (
      <span
        key={index}
        className={`death-mark death-mark--${kind}${index < count ? ' is-set' : ''}`}
      />
    ));
  return (
    <section className="hero-section hero-death" aria-labelledby="hero-death">
      <h3 id="hero-death">{t('Death saves')}</h3>
      <p className="death-row">
        <span>{t('Successes')}</span>
        <span className="death-marks" aria-hidden="true">
          {marks(saves.successes, 'success')}
        </span>
        <span className="visually-hidden">{saves.successes}/3</span>
      </p>
      <p className="death-row">
        <span>{t('Failures')}</span>
        <span className="death-marks" aria-hidden="true">
          {marks(saves.failures, 'failure')}
        </span>
        <span className="visually-hidden">{saves.failures}/3</span>
      </p>
    </section>
  );
}

/**
 * The overview tab: death saves while dying, the table's sections (Hit Point Dice, the DM's level,
 * Stage 530), abilities, attacks and features.
 */
export function OverviewTab({
  entityId,
  sheet,
  derived,
  table,
}: {
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
  readonly table?: ReactNode;
}) {
  return (
    <div className="hero-overview">
      {sheet.deathSaves && <DeathSaves saves={sheet.deathSaves} />}
      {table}
      <Abilities entityId={entityId} derived={derived} />
      <Combat sheet={sheet} derived={derived} />
    </div>
  );
}

const AMMUNITION: Readonly<Record<AmmunitionKind, string>> = {
  arrow: 'Arrows: {count}',
  bolt: 'Bolts: {count}',
  bullet: 'Sling bullets: {count}',
  needle: 'Needles: {count}',
  'firearm-bullet': 'Firearm bullets: {count}',
};

/**
 * What else an attack is (docs/adr/0047-weapons.md): the mastery the character uses with it and the
 * ammunition it has left, joined so a wrapped line never starts with the dot.
 */
function extraWords(t: Translate, attack: CharacterDerived['attacks'][number]): string | null {
  const words = [
    ...(attack.mastery ? [masteryName(t, attack.mastery)] : []),
    ...(attack.ammunition
      ? [t(AMMUNITION[attack.ammunition.kind], { count: attack.ammunition.count })]
      : []),
  ];
  return words.length === 0 ? null : words.join('\u00a0· ');
}
