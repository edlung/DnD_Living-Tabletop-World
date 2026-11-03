import type {
  CharacterDerived,
  CharacterFeaturesResponse,
  CharacterSheet,
  EntityRef,
  FeatureAct,
  ResourceView,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { SrdBlocks } from '../rules/srd-blocks.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { ArcaneRecovery, FontOfMagic, LayOnHands, Inspire } from './feature-forms.tsx';
import {
  ACT_WORDS,
  APPLIED_WORDS,
  FOCUS_USES,
  FOCUS_WORDS,
  RECHARGE_WORDS,
  RESOURCE_EFFECTS,
  RESOURCE_GLYPHS,
  RESOURCE_NAMES,
} from './feature-words.ts';
import { className } from './words.ts';

/** Sends one use of a feature; the World Engine decides and applies it. */
export type UseFeature = (
  feature: FeatureAct,
  extra?: { targetId?: string; amount?: number; slots?: number[]; option?: string },
) => void;

/**
 * The class features on a character's Overview (docs/adr/0056-characters-from-the-srd.md §4): each
 * resource with what is left and the way to use it — the World Engine applies what it can, the
 * rest is the DM's from the feature's words — a Bardic Inspiration die held, and every feature's
 * words on demand. The character's player or the DM uses them.
 */
export function FeatureSection({
  api,
  entityId,
  sheet,
  derived,
  party,
  canUse,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
  /** The party's characters: whom Lay on Hands and Bardic Inspiration reach. */
  readonly party: readonly EntityRef[];
  readonly canUse: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const use: UseFeature = (feature, extra = {}) => {
    onRun({
      kind: 'command',
      command: { type: 'UseFeature', characterId: entityId, feature, ...extra },
    });
  };
  const die = sheet.inspirationDie;
  return (
    <section className="hero-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Class features')}</h3>
      {die && (
        <p className="feature-held">
          <Glyph name="perform" />
          <span>
            {t('You hold a Bardic Inspiration die: d{sides}. Roll it after a failed d20 test.', {
              sides: die.sides,
            })}
          </span>
          {canUse && (
            <button
              type="button"
              className="roll-button roll-button--text"
              disabled={locked}
              onClick={() => {
                use('inspiration-die');
              }}
            >
              <Glyph name="roll" />
              <span>{t(ACT_WORDS['inspiration-die'])}</span>
            </button>
          )}
        </p>
      )}
      {derived.applied.length > 0 && (
        <div className="feature-applied">
          <h4>{t('Applied by the World Engine')}</h4>
          <ul>
            {derived.applied.map((one) => (
              <li key={one.feature}>
                {t(
                  APPLIED_WORDS[one.feature],
                  one.amount === undefined ? {} : { amount: one.amount },
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {derived.resources.length > 0 && (
        <ul className="feature-list">
          {derived.resources.map((view) => (
            <li key={view.resource} className="feature-row">
              <Glyph name={RESOURCE_GLYPHS[view.resource]} />
              <div className="feature-main">
                <span className="feature-name">{t(RESOURCE_NAMES[view.resource])}</span>
                <span className="feature-left">
                  {t(view.unit === 'points' ? '{left} of {max} points' : '{left} of {max} left', {
                    left: view.left,
                    max: view.max,
                  })}
                </span>
                <p className="feature-note">
                  {t(RESOURCE_EFFECTS[view.resource])} {t(RECHARGE_WORDS[view.recharge])}
                </p>
              </div>
              {canUse && (
                <FeatureUse
                  view={view}
                  entityId={entityId}
                  sheet={sheet}
                  party={party}
                  locked={locked}
                  use={use}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <FeatureWords api={api} characterId={entityId} />
    </section>
  );
}

/** The way to use one resource: a button, or the few choices its use asks. */
function FeatureUse({
  view,
  entityId,
  sheet,
  party,
  locked,
  use,
}: {
  readonly view: ResourceView;
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly party: readonly EntityRef[];
  readonly locked: boolean;
  readonly use: UseFeature;
}) {
  const t = useT();
  const empty = view.left === 0;
  const button = (feature: FeatureAct, label: string, disabled = empty, extra = {}) => (
    <button
      key={label}
      type="button"
      disabled={locked || disabled}
      onClick={() => {
        use(feature, extra);
      }}
    >
      {t(label)}
    </button>
  );
  switch (view.resource) {
    case 'rage':
      return (
        <div className="feature-actions">
          {sheet.raging ? button('end-rage', ACT_WORDS['end-rage'], false) : button('rage', 'Rage')}
        </div>
      );
    case 'focus':
      return (
        <div className="feature-actions">
          {FOCUS_USES.map((option) =>
            button('focus', FOCUS_WORDS[option], empty, { option, amount: 1 }),
          )}
        </div>
      );
    case 'lay-on-hands':
      return <LayOnHands view={view} entityId={entityId} party={party} locked={locked} use={use} />;
    case 'bardic-inspiration':
      return <Inspire view={view} entityId={entityId} party={party} locked={locked} use={use} />;
    case 'sorcery-points':
      return <FontOfMagic view={view} sheet={sheet} locked={locked} use={use} />;
    case 'arcane-recovery':
      return <ArcaneRecovery view={view} sheet={sheet} locked={locked} use={use} />;
    default:
      return (
        <div className="feature-actions">{button(view.resource, ACT_WORDS[view.resource])}</div>
      );
  }
}

/** Every feature the character's levels give, in its words: read when opened. */
function FeatureWords({
  api,
  characterId,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
}) {
  const t = useT();
  const [features, setFeatures] = useState<CharacterFeaturesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <details
      className="feature-words"
      onToggle={(event) => {
        if (!event.currentTarget.open || features) return;
        setFailed(false);
        api
          .get<CharacterFeaturesResponse>(
            `characters/${encodeURIComponent(characterId)}/features`,
            new AbortController().signal,
          )
          .then(setFeatures)
          .catch(() => {
            setFailed(true);
          });
      }}
    >
      <summary>{t('Every class feature, in its words')}</summary>
      {failed ? (
        <p role="status">{t('The features could not be read.')}</p>
      ) : !features ? (
        <p className="muted">{t('Reading the features…')}</p>
      ) : (
        <ul className="feature-word-list">
          {features.features.map((feature) => (
            <li key={`${feature.classId}:${feature.name}:${String(feature.level)}`}>
              <details>
                <summary>
                  <span>{feature.name}</span>
                  <span className="muted">
                    {t('{class} {level}', {
                      class: className(t, feature.classId),
                      level: feature.level,
                    })}
                  </span>
                </summary>
                <SrdBlocks blocks={feature.blocks} language={feature.language} />
                {feature.chosen?.map((option) => (
                  <div key={option.name} className="feature-chosen">
                    <h4>{option.name}</h4>
                    <SrdBlocks blocks={option.blocks} language={feature.language} />
                  </div>
                ))}
              </details>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
