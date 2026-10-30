import type { CharacterSheet, StatBlock } from '@ltw/contracts';

/** Original fixture statistics using only mechanics supported by the slice. */
export function bellRanger(): CharacterSheet {
  return {
    classes: [{ classId: 'ranger', level: 3 }],
    abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
    hitPoints: { max: 28, current: 28 },
    armorClass: 14,
    speedFt: 30,
    savingThrows: ['str', 'dex'],
    skills: { proficient: ['perception', 'survival', 'stealth'], expertise: [] },
    fightingStyle: 'archery',
    attacksPerAction: 1,
    weapons: ['longbow'],
    spellSlots: { max: [3, 0, 0, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    spellcasting: [{ source: 'ranger', ability: 'wis', spells: ['hunters-mark'] }],
    conditions: [],
    concentration: null,
  };
}

export function bellWizard(): CharacterSheet {
  return {
    classes: [{ classId: 'wizard', level: 3 }],
    abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
    hitPoints: { max: 20, current: 20 },
    armorClass: 12,
    speedFt: 30,
    savingThrows: ['int', 'wis'],
    skills: { proficient: ['arcana', 'investigation'], expertise: [] },
    attacksPerAction: 1,
    weapons: [],
    spellSlots: { max: [4, 2, 0, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    spellcasting: [{ source: 'wizard', ability: 'int', spells: ['detect-magic', 'misty-step'] }],
    conditions: [],
    concentration: null,
  };
}

export function bellCrab(): StatBlock {
  return {
    armorClass: 13,
    hitPoints: { max: 15, current: 15 },
    speedFt: 20,
    abilities: { str: 14, dex: 10, con: 12, int: 2, wis: 10, cha: 3 },
    savingThrows: { str: 2, dex: 0, con: 1, int: -4, wis: 0, cha: -4 },
    initiativeBonus: 0,
    attacksPerAction: 1,
    attacks: [
      {
        attackId: 'claw',
        name: 'Клешня',
        kind: 'melee',
        bonus: 4,
        reachFt: 5,
        damage: { count: 1, sides: 6, bonus: 2, type: 'bludgeoning' },
      },
    ],
    spells: [],
    conditions: [],
  };
}
