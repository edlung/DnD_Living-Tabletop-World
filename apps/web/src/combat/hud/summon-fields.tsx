import {
  ANIMATED_SIZES,
  ANIMATED_WEIGHT,
  type AnimatedSize,
  type ContextSpell,
  type SummonChoice,
  type SummonOption,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { DAMAGE_WORDS } from '../../dm/hand-words.ts';

/**
 * What a summoning spell calls up (docs/adr/0056-characters-from-the-srd.md §5): the steed's
 * creature type, the insect's form, the spirit's breath, or how many objects of each size come to
 * life within the caster's modifier. The World Engine judges the choice again and builds the
 * creature's stat block.
 */
type Summon = NonNullable<ContextSpell['summon']>;

const OPTION_WORDS: Readonly<Record<SummonOption, string>> = {
  celestial: 'Celestial',
  fey: 'Fey',
  fiend: 'Fiend',
  centipede: 'Centipede',
  spider: 'Spider',
  wasp: 'Wasp',
  acid: DAMAGE_WORDS.acid,
  cold: DAMAGE_WORDS.cold,
  fire: DAMAGE_WORDS.fire,
  lightning: DAMAGE_WORDS.lightning,
  poison: DAMAGE_WORDS.poison,
};

const OPTION_LABEL: Readonly<Record<Summon['creature'], string>> = {
  'otherworldly-steed': 'The steed’s creature type',
  'giant-insect': 'The insect’s form',
  'draconic-spirit': 'Its Breath Weapon',
  'animated-object': 'Objects',
};

const SIZE_WORDS: Readonly<Record<AnimatedSize, string>> = {
  medium: 'Medium or smaller',
  large: 'Large',
  huge: 'Huge',
};

/** The choice a summoning spell starts with: its first option, or one Medium object. */
export function firstSummon(summon: Summon): SummonChoice {
  const option = summon.options[0];
  return option === undefined ? { objects: { medium: 1, large: 0, huge: 0 } } : { option };
}

/** The objects' weight against the caster's modifier: a Large one counts two, a Huge one three. */
export const objectWeight = (choice: SummonChoice): number =>
  ANIMATED_SIZES.reduce(
    (sum, size) => sum + (choice.objects?.[size] ?? 0) * ANIMATED_WEIGHT[size],
    0,
  );

/** Whether the choice can be cast: an option, or at least one object within the budget. */
export function summonReady(summon: Summon, choice: SummonChoice): boolean {
  if (!summon.objects) return choice.option !== undefined;
  const weight = objectWeight(choice);
  return weight > 0 && weight <= summon.objects.budget;
}

export function SummonFields({
  summon,
  value,
  onChange,
}: {
  readonly summon: Summon;
  readonly value: SummonChoice;
  readonly onChange: (next: SummonChoice) => void;
}) {
  const t = useT();
  const ids = useId();
  const objects = summon.objects;
  if (!objects)
    return (
      <div className="action-choice-fields">
        <div className="action-choice-field">
          <label htmlFor={`${ids}-option`}>{t(OPTION_LABEL[summon.creature])}</label>
          <select
            id={`${ids}-option`}
            value={value.option ?? ''}
            onChange={(event) => {
              onChange({ option: event.target.value as SummonOption });
            }}
          >
            {summon.options.map((option) => (
              <option key={option} value={option}>
                {t(OPTION_WORDS[option])}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  const counts = value.objects ?? { medium: 0, large: 0, huge: 0 };
  const weight = objectWeight(value);
  return (
    <fieldset className="summon-objects">
      <legend>{t(OPTION_LABEL[summon.creature])}</legend>
      <div className="action-choice-fields">
        {ANIMATED_SIZES.map((size) => (
          <div className="action-choice-field" key={size}>
            <label htmlFor={`${ids}-${size}`}>{t(SIZE_WORDS[size])}</label>
            <input
              id={`${ids}-${size}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.floor(objects.budget / ANIMATED_WEIGHT[size])}
              value={counts[size]}
              onChange={(event) => {
                const count = Math.max(0, Math.min(9, Math.trunc(Number(event.target.value) || 0)));
                onChange({ objects: { ...counts, [size]: count } });
              }}
            />
          </div>
        ))}
      </div>
      <small className="action-choice-note" aria-live="polite">
        {t('{used} of {budget}: a Large object counts two, a Huge one three.', {
          used: weight,
          budget: objects.budget,
        })}
      </small>
    </fieldset>
  );
}
