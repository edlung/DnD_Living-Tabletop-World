import {
  ABILITIES,
  type CharacterOptionsResponse,
  type CharacterSheet,
  type ChoiceProblem,
  type HitPointsAtLevel,
  type LevelAsksView,
  type LevelOptionsResponse,
  type LevelUpChoices,
  type LevelUpResponse,
} from '@ltw/contracts';
import { readableLabel, useT, type Translate } from '@ltw/ui';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { ABILITY_NAMES, className, signed, skillName } from '../character/words.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { Several } from './builder-choices.tsx';
import { Field, Problems } from './builder-steps.tsx';

/**
 * A level taken (docs/adr/0056-characters-from-the-srd.md §3): the class it goes to — a new one only
 * where the character meets its prerequisites — its hit points, fixed or rolled by the World
 * Engine as the player chooses or the campaign says, and what the level asks of its player; the
 * rules check every choice when it is taken.
 */
const EMPTY = {
  hitPoints: 'fixed',
  cantrips: [],
  spells: [],
  spellbook: [],
  expertise: [],
  invocations: [],
  metamagic: [],
  weaponMasteries: [],
} as const satisfies Omit<LevelUpChoices, 'classId'>;

export function LevelDialog({
  api,
  characterId,
  sheet,
  levels,
  options,
  open,
  onClose,
  onTaken,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly sheet: CharacterSheet;
  readonly levels: LevelOptionsResponse;
  readonly options: CharacterOptionsResponse;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onTaken: () => void;
}) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const hitPointsAtLevel = levels.options.hitPointsAtLevel;
  // The campaign's way, where it has one.
  const empty = {
    ...EMPTY,
    hitPoints: hitPointsAtLevel === 'rolled' ? 'rolled' : 'fixed',
  } as const;
  const [choices, setChoices] = useState<LevelUpChoices>({
    ...empty,
    classId: sheet.classes[0]?.classId ?? 'fighter',
  });
  const [problems, setProblems] = useState<readonly ChoiceProblem[]>([]);
  const [taking, setTaking] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const entry = levels.classes.find((one) => one.classId === choices.classId);
  const asks: LevelAsksView | null = entry && 'asks' in entry ? entry.asks : null;
  const update = (change: Partial<LevelUpChoices>) => {
    setChoices((before) => ({ ...before, ...change }));
    setProblems([]);
  };
  const take = async () => {
    setTaking(true);
    try {
      const answer = await api.post<LevelUpResponse>(
        `characters/${encodeURIComponent(characterId)}/advance`,
        { requestId: requestId.current, choices },
        new AbortController().signal,
        true,
      );
      if (answer.status === 'refused') setProblems(answer.problems);
      else {
        requestId.current = crypto.randomUUID();
        onTaken();
      }
    } catch {
      setProblems([{ field: 'level', message: 'The level could not be taken. Try again.' }]);
    } finally {
      setTaking(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="guide-dialog builder-dialog level-dialog"
      aria-labelledby={`${ids}-title`}
      onClose={(event) => {
        // The character dialog around it stays open (React carries a dialog's close upward).
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="guide-header">
        <h2 id={`${ids}-title`}>{t('Level {level}', { level: levels.level + 1 })}</h2>
        <IconButton glyph="close" label={t('Close')} onClick={onClose} />
      </header>
      <section
        className="builder-body"
        aria-label={t('Level {level}', { level: levels.level + 1 })}
      >
        <div className="builder-step">
          <Field label={t('Class')}>
            {(id) => (
              <select
                id={id}
                value={choices.classId}
                onChange={(event) => {
                  update({ ...empty, classId: event.target.value as LevelUpChoices['classId'] });
                }}
              >
                {levels.classes.map((one) => (
                  <option key={one.classId} value={one.classId} disabled={'refused' in one}>
                    {'refused' in one
                      ? t('{class}: not for this character', { class: className(t, one.classId) })
                      : one.asks.newClass
                        ? t('{class} 1 (a new class)', { class: className(t, one.classId) })
                        : `${className(t, one.classId)} ${String(one.asks.classLevel)}`}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {asks && (
            <LevelChoices
              asks={asks}
              sheet={sheet}
              options={options}
              hitPointsAtLevel={hitPointsAtLevel}
              choices={choices}
              update={update}
            />
          )}
        </div>
      </section>
      {/* The way to take it stays in sight below the choices, the rules' answer beside it. */}
      <footer className="guide-footer">
        <Problems problems={problems} />
        <button
          type="button"
          className="primary-button"
          disabled={
            !asks ||
            taking ||
            (choices.improvement?.kind === 'scores' && choices.improvement.plus.length === 0)
          }
          onClick={() => void take()}
        >
          {t(taking ? 'Taking…' : 'Take the level')}
        </button>
      </footer>
    </dialog>
  );
}

function LevelChoices({
  asks,
  sheet,
  options,
  hitPointsAtLevel,
  choices,
  update,
}: {
  readonly asks: LevelAsksView;
  readonly sheet: CharacterSheet;
  readonly options: CharacterOptionsResponse;
  readonly hitPointsAtLevel: HitPointsAtLevel;
  readonly choices: LevelUpChoices;
  readonly update: (change: Partial<LevelUpChoices>) => void;
}) {
  const t = useT();
  const ids = useId();
  const cls = options.classes.find((one) => one.classId === asks.classId);
  const hitDie = cls?.hitDie ?? 8;
  const known = new Set(sheet.spellcasting.flatMap((source) => source.spells));
  const spellsOf = (level: number) =>
    options.spells.filter(
      (spell) =>
        spell.level === level && spell.classes.includes(asks.classId) && !known.has(spell.spellId),
    );
  const nameOf = (spellId: string) =>
    options.spells.find((spell) => spell.spellId === spellId)?.name ?? spellId;
  const optionName = (optionId: string) =>
    cls?.allOptions.find((one) => one.optionId === optionId)?.name ?? optionId;
  const taken = new Set([
    ...(sheet.classChoices?.invocations ?? []),
    ...(sheet.classChoices?.metamagic ?? []),
  ]);
  const improvement = choices.improvement;
  const feats = options.levelFeats.filter(
    (feat) =>
      feat.featId !== 'ability-score-improvement' && (feat.category === 'General' || asks.epicBoon),
  );
  return (
    <>
      <p className="muted">
        {asks.features.length > 0
          ? t('This level gives: {features}.', { features: asks.features.join(', ') })
          : t('This level gives no new feature.')}
        {asks.subclass ? ` ${t('Subclass: {name}.', { name: asks.subclass })}` : ''}
      </p>
      <fieldset className="builder-inline" aria-describedby={`${ids}-hp-note`}>
        <legend>{t('Hit points')}</legend>
        {hitPointsAtLevel === 'choice' ? (
          (['fixed', 'rolled'] as const).map((way) => (
            <label key={way}>
              <input
                type="radio"
                name={`${ids}-hp`}
                checked={choices.hitPoints === way}
                onChange={() => {
                  update({ hitPoints: way });
                }}
              />
              {hitPointsWay(t, way, hitDie)}
            </label>
          ))
        ) : (
          <p>
            {t('{way} — this campaign’s rule.', {
              way: hitPointsWay(t, hitPointsAtLevel, hitDie),
            })}
          </p>
        )}
        <p id={`${ids}-hp-note`} className="muted builder-note">
          {t('Either way your Constitution modifier is added ({modifier}); at least 1.', {
            modifier: signed(Math.floor((sheet.abilities.con - 10) / 2)),
          })}
        </p>
      </fieldset>
      {asks.improvement && (
        <fieldset className="builder-several">
          <legend>
            {t(asks.epicBoon ? 'Ability scores or an Epic Boon' : 'Ability scores or a feat')}
          </legend>
          <Field label={t('Take')}>
            {(id) => (
              <select
                id={id}
                value={
                  improvement?.kind === 'feat' ? improvement.featId : improvement ? 'scores' : ''
                }
                onChange={(event) => {
                  const value = event.target.value;
                  update({
                    improvement:
                      value === ''
                        ? undefined
                        : value === 'scores'
                          ? { kind: 'scores', plus: [] }
                          : { kind: 'feat', featId: value },
                  });
                }}
              >
                <option value="">{t('Choose…')}</option>
                <option value="scores">{t('Ability Score Improvement')}</option>
                {feats.map((feat) => (
                  <option key={feat.featId} value={feat.featId}>
                    {feat.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {improvement && (
            <Several
              legend={t(
                improvement.kind === 'scores'
                  ? '+2 to one, or +1 to two'
                  : 'The score the feat raises',
              )}
              wanted={improvement.kind === 'scores' ? 2 : 1}
              from={[...ABILITIES]}
              chosen={
                improvement.kind === 'scores'
                  ? improvement.plus
                  : improvement.ability
                    ? [improvement.ability]
                    : []
              }
              nameOf={(ability) => t(ABILITY_NAMES[ability])}
              onChange={(next) => {
                update({
                  improvement:
                    improvement.kind === 'scores'
                      ? { kind: 'scores', plus: next }
                      : {
                          kind: 'feat',
                          featId: improvement.featId,
                          ...(next[0] ? { ability: next[0] } : {}),
                        },
                });
              }}
            />
          )}
        </fieldset>
      )}
      {asks.fightingStyle && (
        <fieldset className="builder-inline">
          <legend>{t('Fighting style')}</legend>
          {options.fightingStyles.map((style) => (
            <label key={style.featId}>
              <input
                type="radio"
                name={`${ids}-style`}
                checked={choices.fightingStyle === style.featId}
                onChange={() => {
                  update({ fightingStyle: style.featId });
                }}
              />
              {style.name}
            </label>
          ))}
        </fieldset>
      )}
      {asks.multiclassSkill && (
        <Field label={t('The skill your new class gives')}>
          {(id) => (
            <select
              id={id}
              value={choices.multiclassSkill ?? ''}
              onChange={(event) => {
                update({
                  multiclassSkill: (event.target.value ||
                    undefined) as LevelUpChoices['multiclassSkill'],
                });
              }}
            >
              <option value="">{t('Choose…')}</option>
              {(asks.multiclassSkill ?? []).map((skill) => (
                <option key={skill} value={skill}>
                  {skillName(t, skill)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {asks.expertise > 0 && (
        <Several
          legend={t('Expertise')}
          wanted={asks.expertise}
          from={sheet.skills.proficient.filter((skill) => !sheet.skills.expertise.includes(skill))}
          chosen={choices.expertise}
          nameOf={(skill) => skillName(t, skill)}
          onChange={(expertise) => {
            update({ expertise });
          }}
        />
      )}
      {(['invocations', 'metamagic'] as const).map((kind) =>
        asks[kind] > 0 ? (
          <Several
            key={kind}
            legend={t(kind === 'invocations' ? 'Eldritch Invocations' : 'Metamagic')}
            wanted={asks[kind]}
            from={(cls?.allOptions ?? []).map((one) => one.optionId).filter((id) => !taken.has(id))}
            chosen={choices[kind]}
            nameOf={optionName}
            onChange={(next) => {
              update({ [kind]: next });
            }}
          />
        ) : null,
      )}
      {asks.weaponMasteries > 0 && (
        <Several
          legend={t('Weapon Mastery')}
          wanted={asks.weaponMasteries}
          from={options.weapons
            .map((one) => one.weaponId)
            .filter((id) => !(sheet.weaponMasteries ?? []).includes(id))}
          chosen={choices.weaponMasteries}
          nameOf={(id) => options.weapons.find((one) => one.weaponId === id)?.name ?? id}
          onChange={(weaponMasteries) => {
            update({ weaponMasteries });
          }}
        />
      )}
      {asks.cantrips > 0 && (
        <Several
          legend={t('Cantrips')}
          wanted={asks.cantrips}
          from={spellsOf(0).map((spell) => spell.spellId)}
          chosen={choices.cantrips}
          nameOf={nameOf}
          onChange={(cantrips) => {
            update({ cantrips });
          }}
        />
      )}
      {asks.spellbook > 0 && (
        <Several
          legend={t('Your spellbook')}
          wanted={asks.spellbook}
          from={Array.from({ length: asks.maxSpellLevel }, (_, index) => spellsOf(index + 1))
            .flat()
            .map((spell) => spell.spellId)
            .filter((id) => !(sheet.classChoices?.spellbook ?? []).includes(id))}
          chosen={choices.spellbook}
          nameOf={nameOf}
          onChange={(spellbook) => {
            update({ spellbook, spells: choices.spells.filter((id) => spellbook.includes(id)) });
          }}
        />
      )}
      {asks.spells > 0 && (
        <Several
          legend={t('Prepared spells')}
          wanted={asks.spells}
          from={
            asks.classId === 'wizard'
              ? [...(sheet.classChoices?.spellbook ?? []), ...choices.spellbook].filter(
                  (id) => !known.has(id),
                )
              : Array.from({ length: asks.maxSpellLevel }, (_, index) => spellsOf(index + 1))
                  .flat()
                  .map((spell) => spell.spellId)
          }
          chosen={choices.spells}
          nameOf={nameOf}
          onChange={(spells) => {
            update({ spells });
          }}
        />
      )}
      {cls === undefined && <p className="muted">{t(readableLabel(asks.classId))}</p>}
    </>
  );
}

const hitPointsWay = (t: Translate, way: 'fixed' | 'rolled', hitDie: number) =>
  way === 'fixed'
    ? t('The fixed value: {value}', { value: Math.floor(hitDie / 2) + 1 })
    : t('A d{sides} rolled by the World Engine', { sides: hitDie });
