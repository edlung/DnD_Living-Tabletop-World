import type { CharacterOptionsResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { ABILITY_NAMES, ABILITY_ORDER, signed, skillName } from '../character/words.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { EquipmentStep, SkillsStep } from './builder-choices.tsx';
import { SpellsStep } from './builder-spells.tsx';
import { AbilitiesStep, ClassStep, Field, OriginStep, Problems } from './builder-steps.tsx';
import { useBuilder, type Builder } from './use-builder.ts';

/**
 * The character builder (docs/adr/0056-characters-from-the-srd.md §2): a dialog of steps — class,
 * origin, abilities, skills, equipment, spells — each marked while its choices do not hold, and a
 * last step that names the character and makes it through the World Engine. The DM may make it
 * for the player of a character; a player makes their own.
 */
const STEPS = [
  { title: 'Class', fields: ['classId'] },
  {
    title: 'Origin',
    fields: [
      'speciesId',
      'speciesOption',
      'size',
      'speciesAbility',
      'originFeat',
      'backgroundId',
      'increases',
    ],
  },
  { title: 'Abilities', fields: ['abilities'] },
  {
    title: 'Skills',
    fields: [
      'skills',
      'moreSkills',
      'expertise',
      'tools',
      'fightingStyle',
      'order',
      'invocations',
      'weaponMasteries',
    ],
  },
  { title: 'Equipment', fields: ['equipment'] },
  { title: 'Spells', fields: ['cantrips', 'spells', 'spellbook', 'magicInitiate'] },
  { title: 'Name and make', fields: ['sheet'] },
] as const;

export interface BuilderPlayer {
  readonly characterId: string;
  readonly name: string;
}

export function BuilderDialog({
  api,
  open,
  onClose,
  onMade,
  players = [],
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onMade: (characterId: string, name: string) => void;
  /** The DM's: the players' characters, to make one for the same player. */
  readonly players?: readonly BuilderPlayer[];
}) {
  const t = useT();
  const ids = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const builder = useBuilder(api, open);
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const marked = (index: number) =>
    STEPS[index]?.fields.some((field) => builder.problemsOf(field).length > 0) ?? false;
  const options = builder.options;
  return (
    <dialog
      ref={ref}
      className="guide-dialog builder-dialog"
      aria-labelledby={`${ids}-title`}
      onClose={(event) => {
        // React carries a dialog's close up its tree: the character dialog around it stays open.
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="guide-header">
        <h2 id={`${ids}-title`}>{t('Make a character')}</h2>
        <IconButton glyph="close" label={t('Close')} onClick={onClose} />
      </header>
      <nav className="builder-nav" aria-label={t('Steps')}>
        <ol>
          {STEPS.map((one, index) => (
            <li key={one.title}>
              <button
                type="button"
                aria-current={index === step ? 'step' : undefined}
                className={marked(index) ? 'builder-nav-step builder-nav-open' : 'builder-nav-step'}
                onClick={() => {
                  setStep(index);
                }}
              >
                <span className="builder-nav-number">{index + 1}</span>
                <span className="builder-nav-title">{t(one.title)}</span>
                {marked(index) && <span className="visually-hidden">{t('(to finish)')}</span>}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section className="builder-body" aria-labelledby={`${ids}-step`}>
        <h3 id={`${ids}-step`} className="builder-step-title">
          {t(STEPS[step]?.title ?? '')}
        </h3>
        {!options ? (
          <StatusPanel
            state={builder.failed ? 'error' : 'loading'}
            label={t(builder.failed ? 'The choices could not be read.' : 'Reading the choices…')}
          />
        ) : (
          <Step
            index={step}
            options={options}
            builder={builder}
            players={players}
            onMade={onMade}
          />
        )}
      </section>
      <footer className="guide-footer">
        <span className="guide-step">
          {t('Step {step} of {steps}', { step: step + 1, steps: STEPS.length })}
        </span>
        <div className="builder-footer-actions">
          <button
            type="button"
            className="secondary"
            disabled={step === 0}
            onClick={() => {
              setStep(step - 1);
            }}
          >
            {t('Back')}
          </button>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => {
                setStep(step + 1);
              }}
            >
              {t('Next')}
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}

function Step({
  index,
  options,
  builder,
  players,
  onMade,
}: {
  readonly index: number;
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
  readonly players: readonly BuilderPlayer[];
  readonly onMade: (characterId: string, name: string) => void;
}) {
  switch (index) {
    case 0:
      return <ClassStep options={options} builder={builder} />;
    case 1:
      return <OriginStep options={options} builder={builder} />;
    case 2:
      return <AbilitiesStep builder={builder} />;
    case 3:
      return <SkillsStep options={options} builder={builder} />;
    case 4:
      return <EquipmentStep options={options} builder={builder} />;
    case 5:
      return <SpellsStep options={options} builder={builder} />;
    default:
      return <Review options={options} builder={builder} players={players} onMade={onMade} />;
  }
}

/** The last step: what the choices make, a name, and the character made. */
function Review({
  options,
  builder,
  players,
  onMade,
}: {
  readonly options: CharacterOptionsResponse;
  readonly builder: Builder;
  readonly players: readonly BuilderPlayer[];
  readonly onMade: (characterId: string, name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [forPlayerOf, setForPlayerOf] = useState('');
  const sheet = builder.preview?.sheet ?? null;
  const problems = builder.preview?.problems ?? [];
  const refused = builder.refused;
  const spellName = (spellId: string) =>
    options.spells.find((spell) => spell.spellId === spellId)?.name ?? spellId;
  return (
    <div className="builder-step">
      <Field label={t('Name')}>
        {(id) => (
          <input
            id={id}
            value={name}
            maxLength={120}
            required
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        )}
      </Field>
      {players.length > 0 && (
        <Field label={t('Whose character')}>
          {(id) => (
            <select
              id={id}
              value={forPlayerOf}
              onChange={(event) => {
                setForPlayerOf(event.target.value);
              }}
            >
              <option value="">{t('Nobody’s yet: invite a player to it')}</option>
              {players.map((player) => (
                <option key={player.characterId} value={player.characterId}>
                  {t('The player of {name}', { name: player.name })}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {sheet ? (
        <dl className="builder-facts builder-summary">
          <dt>{t('Hit points')}</dt>
          <dd>{sheet.hitPoints.max}</dd>
          <dt>{t('Armor Class')}</dt>
          <dd>{t('{ac} before armor is worn', { ac: sheet.armorClass })}</dd>
          <dt>{t('Speed')}</dt>
          <dd>{t('{speed} ft', { speed: sheet.speedFt })}</dd>
          <dt>{t('Abilities')}</dt>
          <dd>
            {builder.draft.abilities.method === 'rolled'
              ? t('Rolled when the character is made')
              : ABILITY_ORDER.map(
                  (ability) =>
                    `${t(ABILITY_NAMES[ability])} ${String(sheet.abilities[ability])} (${signed(Math.floor((sheet.abilities[ability] - 10) / 2))})`,
                ).join(', ')}
          </dd>
          <dt>{t('Skills')}</dt>
          <dd>{sheet.skills.proficient.map((skill) => skillName(t, skill)).join(', ')}</dd>
          {sheet.spellcasting.length > 0 && (
            <>
              <dt>{t('Spells')}</dt>
              <dd>
                {sheet.spellcasting.flatMap((source) => source.spells.map(spellName)).join(', ')}
              </dd>
            </>
          )}
          <dt>{t('Equipment')}</dt>
          <dd>
            {builder.preview?.items
              .map((item) =>
                item.quantity > 1 ? `${String(item.quantity)} × ${item.name}` : item.name,
              )
              .join(', ')}
          </dd>
        </dl>
      ) : (
        <p className="muted">{t('Finish the marked steps to see the character.')}</p>
      )}
      <Problems problems={problems} />
      {refused !== null && (
        <p className="builder-over" role="alert">
          {typeof refused === 'string'
            ? t(refused)
            : refused.map((one) => t(one.message, one.params)).join(' ')}
        </p>
      )}
      <button
        type="button"
        disabled={sheet === null || name.trim() === '' || builder.making}
        onClick={() => {
          void builder
            .make(name.trim(), forPlayerOf === '' ? null : forPlayerOf)
            .then((characterId) => {
              if (characterId) onMade(characterId, name.trim());
            });
        }}
      >
        {t(builder.making ? 'Making…' : 'Make the character')}
      </button>
    </div>
  );
}
