import type { CharacterSheet, StatBlock } from '../../packages/contracts/src/index.ts';

import type { HeroKey } from './data.ts';

const emptySlots = () => Array<number>(9).fill(0);

/** Supported slice mechanics only. Armor starts carried and is equipped by its player. */
export function heroSheet(key: HeroKey): CharacterSheet {
  const fighter = key === 'toren';
  const rogue = key === 'leya';
  const cleric = key === 'amalia';
  const hp = fighter ? 31 : rogue || cleric ? 24 : 20;
  return {
    classes: [
      { classId: fighter ? 'fighter' : rogue ? 'rogue' : cleric ? 'cleric' : 'wizard', level: 3 },
    ],
    abilities: fighter
      ? { str: 16, dex: 12, con: 16, int: 10, wis: 12, cha: 10 }
      : rogue
        ? { str: 10, dex: 16, con: 14, int: 14, wis: 12, cha: 12 }
        : cleric
          ? { str: 12, dex: 12, con: 14, int: 10, wis: 16, cha: 14 }
          : { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 12 },
    hitPoints: { max: hp, current: hp },
    armorClass: rogue ? 13 : key === 'emil' ? 12 : 11,
    speedFt: 30,
    savingThrows: fighter
      ? ['str', 'con']
      : rogue
        ? ['dex', 'int']
        : cleric
          ? ['wis', 'cha']
          : ['int', 'wis'],
    skills: {
      proficient: fighter
        ? ['athletics', 'perception', 'survival']
        : rogue
          ? ['investigation', 'stealth', 'sleight-of-hand', 'acrobatics']
          : cleric
            ? ['insight', 'medicine', 'persuasion', 'nature']
            : ['arcana', 'investigation', 'history'],
      expertise: rogue ? ['investigation', 'stealth'] : [],
    },
    attacksPerAction: 1,
    weapons: fighter ? ['longsword', 'handaxe'] : rogue ? ['rapier', 'shortbow'] : ['quarterstaff'],
    spellSlots: {
      max: cleric || key === 'emil' ? [4, 2, 0, 0, 0, 0, 0, 0, 0] : emptySlots(),
      expended: emptySlots(),
    },
    spellcasting: cleric
      ? [{ source: 'cleric', ability: 'wis', spells: ['healing-word', 'detect-magic'] }]
      : key === 'emil'
        ? [{ source: 'wizard', ability: 'int', spells: ['detect-magic', 'misty-step'] }]
        : [],
    conditions: [],
    concentration: null,
  };
}

/** Small optional automata encounters, balanced conservatively for three level-3 characters. */
export function automaton(hp: number, ac: number, bonus: number): StatBlock {
  return {
    armorClass: ac,
    hitPoints: { max: hp, current: hp },
    speedFt: 20,
    abilities: { str: 12, dex: 10, con: 12, int: 6, wis: 10, cha: 8 },
    savingThrows: { str: 1, dex: 0, con: 1, int: -2, wis: 0, cha: -1 },
    initiativeBonus: 0,
    attacksPerAction: 1,
    attacks: [
      {
        attackId: 'padded-arm',
        name: 'Мягкий упор',
        kind: 'melee',
        bonus,
        reachFt: 5,
        damage: { count: 1, sides: 4, bonus: 1, type: 'bludgeoning' },
      },
    ],
    spells: [],
    conditions: [],
  };
}
