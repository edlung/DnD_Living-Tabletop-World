import { ABILITIES, SKILLS, type Check, type RollMode, type Skill } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { ABILITY_NAMES, skillName } from '../character/words.ts';

/** A check as a select's value: `skill:athletics`, `ability:str`, `save:dex`. */
export const checkValue = (check: Check): string =>
  check.kind === 'skill' ? `skill:${check.skill}` : `${check.kind}:${check.ability}`;

export function checkOf(value: string): Check | null {
  const [kind, key] = value.split(':');
  if (kind === 'skill' && key && key in SKILLS) return { kind, skill: key as Skill };
  const ability = ABILITIES.find((name) => name === key);
  if ((kind === 'ability' || kind === 'save') && ability) return { kind, ability };
  return null;
}

/** Every check a select offers, grouped: skills, ability checks, saving throws. */
export function checkGroups(t: Translate) {
  const skills = (Object.keys(SKILLS) as Skill[])
    .map((skill) => ({ value: `skill:${skill}`, label: skillName(t, skill) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    { label: t('Skills'), options: skills },
    {
      label: t('Ability checks'),
      options: ABILITIES.map((ability) => ({
        value: `ability:${ability}`,
        label: t('{ability} check', { ability: t(ABILITY_NAMES[ability]) }),
      })),
    },
    {
      label: t('Saving throws'),
      options: ABILITIES.map((ability) => ({
        value: `save:${ability}`,
        label: t('{ability} saving throw', { ability: t(ABILITY_NAMES[ability]) }),
      })),
    },
  ];
}

export const MODE_WORDS: Readonly<Record<RollMode, string>> = {
  normal: 'Normal',
  advantage: 'With advantage',
  disadvantage: 'With disadvantage',
};

/** "Dexterity saving throw", in words, with its mode when it has one. */
export function checkWords(t: Translate, check: Check, mode: RollMode): string {
  const name =
    check.kind === 'skill'
      ? t('{skill} check', { skill: skillName(t, check.skill) })
      : check.kind === 'ability'
        ? t('{ability} check', { ability: t(ABILITY_NAMES[check.ability]) })
        : t('{ability} saving throw', { ability: t(ABILITY_NAMES[check.ability]) });
  return mode === 'normal' ? name : `${name} · ${t(MODE_WORDS[mode])}`;
}
