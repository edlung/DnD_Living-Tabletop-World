import type { CampaignOptions, CharacterChoices } from '../../../packages/contracts/src/index.ts';

import { t, type Text } from './text.ts';

/**
 * The ready-made level-1 characters of The Bells of Hollowmere (docs/adr/0058-campaign-content.md
 * §5): each the builder's choices, which the World Engine turns into a sheet and starting gear in
 * the campaign's language (`CreateCharacter`, ADR 0056), kept by the DM for an invitation. A
 * player may take one, or build their own. The campaign levels by milestones.
 */
export interface Pregen {
  readonly name: Text;
  readonly choices: CharacterChoices;
}

export const OPTIONS: CampaignOptions = {
  hitPointsAtLevel: 'choice',
  levelsBy: 'milestone',
  carrying: 'shown',
  startingLevel: 1,
  craftingHelpers: 1,
};

/** A class with no invocations, cantrips or spells chooses none. */
const none: Pick<CharacterChoices, 'invocations' | 'cantrips' | 'spells' | 'spellbook'> = {
  invocations: [],
  cantrips: [],
  spells: [],
  spellbook: [],
};

export const PREGENS: readonly Pregen[] = [
  {
    name: t('Bryn Ashdown', 'Брин Эшдаун'),
    choices: {
      ...none,
      classId: 'fighter',
      speciesId: 'human',
      backgroundId: 'soldier',
      abilities: {
        method: 'standard-array',
        base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      },
      increases: { plus2: 'str', plus1: 'con' },
      skills: ['perception', 'survival'],
      moreSkills: ['insight'],
      expertise: [],
      tools: ['srd-dice-gaming-set'],
      languages: ['dwarvish', 'halfling'],
      equipment: { classOption: 'A', backgroundOption: 'A', picks: ['srd-dice-gaming-set'] },
      originFeat: 'alert',
      fightingStyle: 'defense',
      weaponMasteries: ['greatsword', 'flail', 'javelin'],
    },
  },
  {
    name: t('Hesk Coalbeard', 'Хеск Коулберд'),
    choices: {
      ...none,
      classId: 'cleric',
      speciesId: 'dwarf',
      backgroundId: 'acolyte',
      abilities: {
        method: 'standard-array',
        base: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 },
      },
      increases: { plus2: 'wis', plus1: 'cha' },
      skills: ['medicine', 'persuasion'],
      moreSkills: [],
      expertise: [],
      tools: [],
      languages: ['dwarvish', 'giant'],
      equipment: {
        classOption: 'A',
        backgroundOption: 'A',
        picks: ['srd-amulet-holy-symbol', 'srd-amulet-holy-symbol'],
      },
      order: 'protector',
      weaponMasteries: [],
      cantrips: ['guidance', 'sacred-flame', 'spare-the-dying'],
      spells: ['bless', 'cure-wounds', 'guiding-bolt', 'healing-word'],
      magicInitiate: {
        list: 'cleric',
        ability: 'wis',
        cantrips: ['light', 'thaumaturgy'],
        spell: 'shield-of-faith',
      },
    },
  },
  {
    name: t('Wren Underbough', 'Рен Андербоу'),
    choices: {
      ...none,
      classId: 'rogue',
      speciesId: 'halfling',
      backgroundId: 'criminal',
      abilities: {
        method: 'standard-array',
        base: { str: 8, dex: 15, con: 13, int: 12, wis: 14, cha: 10 },
      },
      increases: { plus2: 'dex', plus1: 'con' },
      skills: ['acrobatics', 'perception', 'investigation', 'deception'],
      moreSkills: [],
      expertise: ['stealth', 'perception'],
      tools: [],
      languages: ['halfling', 'elvish', 'goblin'],
      equipment: { classOption: 'A', backgroundOption: 'A', picks: [] },
      weaponMasteries: ['dagger', 'shortsword'],
    },
  },
  {
    name: t('Lyra Venn', 'Лира Венн'),
    choices: {
      ...none,
      classId: 'wizard',
      speciesId: 'elf',
      speciesOption: 'high elf',
      speciesAbility: 'int',
      backgroundId: 'sage',
      abilities: {
        method: 'standard-array',
        base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
      },
      increases: { plus2: 'int', plus1: 'con' },
      skills: ['investigation', 'insight'],
      moreSkills: ['perception'],
      expertise: [],
      tools: [],
      languages: ['elvish', 'gnomish'],
      equipment: { classOption: 'A', backgroundOption: 'A', picks: [] },
      weaponMasteries: [],
      cantrips: ['fire-bolt', 'mage-hand', 'light'],
      spellbook: [
        'magic-missile',
        'shield',
        'sleep',
        'detect-magic',
        'mage-armor',
        'burning-hands',
      ],
      spells: ['magic-missile', 'shield', 'sleep', 'mage-armor'],
      magicInitiate: {
        list: 'wizard',
        ability: 'int',
        cantrips: ['minor-illusion', 'ray-of-frost'],
        spell: 'find-familiar',
      },
    },
  },
];
