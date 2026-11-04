import type { CampaignOptions } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * The campaign's options in words (docs/adr/0056-characters-from-the-srd.md §3): each choice short
 * enough for a phone's select, what it means in the field's hint.
 */
export const HIT_POINT_WORDS: Readonly<Record<CampaignOptions['hitPointsAtLevel'], string>> = {
  choice: 'The player chooses',
  fixed: 'Always fixed',
  rolled: 'Always rolled',
};
export const LEVEL_WORDS: Readonly<Record<CampaignOptions['levelsBy'], string>> = {
  experience: 'By experience',
  milestone: 'By milestone',
};
export const CARRYING_WORDS: Readonly<Record<CampaignOptions['carrying'], string>> = {
  shown: 'Shown',
  enforced: 'Enforced',
};

export const OPTION_KEYS = ['hitPointsAtLevel', 'levelsBy', 'carrying', 'startingLevel'] as const;

/** Each option as the history tells it changed. */
const CHANGED_WORDS = {
  hitPointsAtLevel: {
    choice: 'hit points chosen by the player',
    fixed: 'hit points always fixed',
    rolled: 'hit points always rolled',
  },
  levelsBy: { experience: 'levels by experience', milestone: 'levels by milestone' },
  carrying: { shown: 'carrying shown', enforced: 'carrying enforced' },
} as const;

/** The options' changes from one set to another, in words. */
export function optionChanges(t: Translate, from: CampaignOptions, to: CampaignOptions): string {
  return OPTION_KEYS.filter((key) => from[key] !== to[key])
    .map((key) =>
      key === 'startingLevel'
        ? t('new characters at level {level}', { level: to.startingLevel })
        : key === 'hitPointsAtLevel'
          ? t(CHANGED_WORDS.hitPointsAtLevel[to.hitPointsAtLevel])
          : key === 'levelsBy'
            ? t(CHANGED_WORDS.levelsBy[to.levelsBy])
            : t(CHANGED_WORDS.carrying[to.carrying]),
    )
    .join('; ');
}
