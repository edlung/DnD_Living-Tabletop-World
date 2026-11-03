import type { CharacterSheet } from '@ltw/contracts';

import { abilityModifier } from '../character-math.ts';

/**
 * The Eldritch Invocations the World Engine applies (SRD 5.2.1; docs/adr/0056-characters-from-the-
 * srd.md §4): the spells some cast at will without a slot (on the Warlock alone, for some), Eldritch
 * Blast's Agonizing Blast, Eldritch Spear and Repelling Blast, and Eldritch Mind. The rest are the
 * DM's, in their words on the sheet. A Warlock's damaging cantrip is taken to be Eldritch Blast.
 */
export const INVOCATION_SPELLS: Readonly<
  Record<string, { readonly spellId: string; readonly self: boolean }>
> = {
  'armor-of-shadows': { spellId: 'mage-armor', self: true },
  'ascendant-step': { spellId: 'levitate', self: true },
  'fiendish-vigor': { spellId: 'false-life', self: true },
  'mask-of-many-faces': { spellId: 'disguise-self', self: false },
  'master-of-myriad-forms': { spellId: 'alter-self', self: false },
  'misty-visions': { spellId: 'silent-image', self: false },
  'otherworldly-leap': { spellId: 'jump', self: true },
  'visions-of-distant-realms': { spellId: 'arcane-eye', self: false },
  'whispers-of-the-grave': { spellId: 'speak-with-dead', self: false },
};

export const hasInvocation = (sheet: CharacterSheet, optionId: string): boolean =>
  sheet.classChoices?.invocations?.includes(optionId) ?? false;

const warlockLevel = (sheet: CharacterSheet): number =>
  sheet.classes.find((entry) => entry.classId === 'warlock')?.level ?? 0;

/** The spells the sheet's invocations cast at will, each with whether only on the Warlock. */
export function atWillSpells(
  sheet: CharacterSheet,
): readonly { readonly spellId: string; readonly self: boolean }[] {
  return Object.entries(INVOCATION_SPELLS).flatMap(([optionId, spell]) =>
    hasInvocation(sheet, optionId) ? [spell] : [],
  );
}

/**
 * The sheet with its invocations' at-will spells on the Warlock's casting: known, and cast without a
 * slot (`atWill`). Spells no invocation gives any more leave the at-will list, not the spells.
 */
export function withInvocationSpells(sheet: CharacterSheet): CharacterSheet {
  const spells = atWillSpells(sheet).map((one) => one.spellId);
  const has = sheet.spellcasting.some((source) => source.source === 'warlock');
  if (spells.length === 0 && !sheet.spellcasting.some((source) => source.atWill)) return sheet;
  const add = (known: readonly string[]) => [...new Set([...known, ...spells])];
  const spellcasting = has
    ? sheet.spellcasting.map((source) => {
        if (source.source !== 'warlock') return source;
        const next = { ...source, spells: add(source.spells) };
        if (spells.length > 0) next.atWill = [...spells];
        else delete next.atWill;
        return next;
      })
    : spells.length > 0
      ? [
          ...sheet.spellcasting,
          { source: 'warlock' as const, ability: 'cha' as const, spells, atWill: [...spells] },
        ]
      : sheet.spellcasting;
  return { ...sheet, spellcasting };
}

/** A spell an invocation casts at will on the Warlock alone. */
export const atWillOnSelf = (sheet: CharacterSheet, spellId: string): boolean =>
  atWillSpells(sheet).some((one) => one.spellId === spellId && one.self);

/** Eldritch Spear: Eldritch Blast's range plus 30 ft per Warlock level. */
export const spellRangeBonusFt = (sheet: CharacterSheet, spellId: string): number =>
  spellId === 'eldritch-blast' && hasInvocation(sheet, 'eldritch-spear')
    ? 30 * warlockLevel(sheet)
    : 0;

/** Agonizing Blast: the Charisma modifier added to each Eldritch Blast beam's damage. */
export const spellDamageBonus = (sheet: CharacterSheet, spellId: string): number =>
  spellId === 'eldritch-blast' && hasInvocation(sheet, 'agonizing-blast')
    ? abilityModifier(sheet.abilities.cha)
    : 0;

/** Repelling Blast: an Eldritch Blast beam that hits pushes a Large or smaller creature 10 ft. */
export const repellingBlast = (sheet: CharacterSheet, spellId: string): boolean =>
  spellId === 'eldritch-blast' && hasInvocation(sheet, 'repelling-blast');

/** Eldritch Mind: Advantage on Constitution saves to keep Concentration. */
export const eldritchMind = (sheet: CharacterSheet): boolean =>
  hasInvocation(sheet, 'eldritch-mind');
