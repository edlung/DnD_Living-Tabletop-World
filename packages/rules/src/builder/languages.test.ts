import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { deriveCharacter } from '../character-derived.ts';
import { choicesFor } from '../testing/character-choices.ts';
import { buildCharacter } from './build.ts';
import { levelAsks, levelUpCharacter } from './level-up.ts';
import { classSpellList } from './spells.ts';

/**
 * Languages (SRD 5.2.1, Character Creation step 2; docs/adr/0056-characters-from-the-srd.md §2):
 * Common and two standard ones; a Druid's Druidic, a Rogue's Thieves' Cant and one more; a
 * Ranger's two at level 2 with Deft Explorer's Expertise.
 */
const four = () => 4;
const built = (choices: Parameters<typeof buildCharacter>[0]): CharacterSheet => {
  const result = buildCharacter(choices, four);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.sheet;
};
const problemsOf = (choices: Parameters<typeof buildCharacter>[0]) => {
  const result = buildCharacter(choices, four);
  return result.ok ? [] : result.problems.filter((one) => one.field === 'languages');
};

describe('a new character’s languages', () => {
  it('are Common, the two chosen, and a class’s own', () => {
    expect(built(choicesFor('fighter')).languages).toEqual(['common', 'dwarvish', 'elvish']);
    expect(built(choicesFor('druid')).languages).toEqual([
      'common',
      'dwarvish',
      'elvish',
      'druidic',
    ]);
    expect(built(choicesFor('rogue')).languages).toEqual([
      'common',
      'dwarvish',
      'elvish',
      'sylvan',
      'thieves-cant',
    ]);
  });

  it('are chosen in full: two of the standard table, never one known already', () => {
    expect(problemsOf(choicesFor('fighter', { languages: ['dwarvish'] }))).toEqual([
      { field: 'languages', message: 'Choose {count} languages', params: { count: 2 } },
    ]);
    expect(
      problemsOf(choicesFor('fighter', { languages: ['dwarvish', 'common'] }))[0]?.message,
    ).toBe('Common and a class’s own languages are known already');
    expect(
      problemsOf(choicesFor('fighter', { languages: ['abyssal', 'elvish'] }))[0]?.message,
    ).toBe('Two of them from the standard languages');
    // A Rogue's third may come from the rare table.
    expect(problemsOf(choicesFor('rogue', { languages: ['orc', 'giant', 'infernal'] }))).toEqual(
      [],
    );
  });
});

describe('the languages a level gives', () => {
  it('asks a Ranger’s two at level 2, with Deft Explorer’s one Expertise', () => {
    const ranger = built(choicesFor('ranger'));
    const asks = levelAsks(ranger, 'ranger');
    if (typeof asks === 'string') throw new Error(asks);
    expect([asks.languages, asks.expertise]).toEqual([2, 1]);
    const skill = ranger.skills.proficient[0];
    const known = ranger.spellcasting.flatMap((source) => source.spells);
    const spell = classSpellList('ranger', 1).find((id) => !known.includes(id));
    if (!skill || !spell) throw new Error('no skill or spell');
    const level = (languages: string[]) =>
      levelUpCharacter(
        ranger,
        {
          classId: 'ranger',
          hitPoints: 'fixed',
          cantrips: [],
          spells: [spell],
          spellbook: [],
          expertise: [skill],
          invocations: [],
          metamagic: [],
          weaponMasteries: [],
          fightingStyle: 'archery',
          languages: languages as never,
        },
        four,
      );
    const twice = level(['elvish', 'giant']);
    expect(twice.ok ? [] : twice.problems.map((one) => one.message)).toContain(
      'A language the character knows already',
    );
    const taken = level(['giant', 'sylvan']);
    if (!taken.ok) throw new Error(JSON.stringify(taken.problems));
    expect(taken.sheet.languages).toEqual(['common', 'dwarvish', 'elvish', 'giant', 'sylvan']);
  });
});

describe('what a character knows, named', () => {
  it('names its origin, feats, tools and languages in the campaign’s language', () => {
    const rogue = built(choicesFor('rogue'));
    const english = deriveCharacter(rogue).proficiencies;
    expect(english).toMatchObject({
      species: 'Dwarf',
      background: 'Acolyte',
      languages: ['Common', 'Dwarvish', 'Elvish', 'Sylvan', 'Thieves’ Cant'],
    });
    const russian = deriveCharacter(rogue, [], {}, 'ru').proficiencies;
    expect(russian.languages).toEqual([
      'Общий',
      'Дварфийский',
      'Эльфийский',
      'Сильван',
      'Воровской жаргон',
    ]);
    expect(russian.species).not.toBe('Dwarf');
  });
});
