import type { CharacterSheet } from '@ltw/contracts';

import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { ownItem, withSaveBonus, withSheet } from './handling.ts';
import { armorClassDelta, carriedBy, clampArmorClass, entryOf, magicBonus } from './records.ts';

/**
 * Attunement (docs/adr/0054-items-as-data.md §5): the DM's, or the table's for a player during a
 * Short Rest (the server's rest checks it). An item that needs it, carried; no more than three, and
 * one copy of each; who the item names (a class) may attune. A worn item's Armor Class and saves
 * follow at once. A cursed item's attunement ends only as the DM lifts the curse.
 */
const ATTUNED_AT_MOST = 3;
const CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

export function decideAttuneItem(
  state: WorldState,
  command: ResolvedCommandOf<'AttuneItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const { possession } = own;
  const entry = entryOf(possession);
  const needs = entry?.magic?.attunement;
  if (!entry || needs === undefined || needs === null)
    return reject('NO_EFFECT', 'It needs no attunement');
  const attuned = possession.attuned === true;
  if (command.attuned === attuned)
    return reject('NO_EFFECT', attuned ? 'Already attuned to it' : 'Not attuned to it');
  const sheet = state.characterSheets.get(command.characterId);
  if (command.attuned) {
    const others = carriedBy(state, command.characterId).filter(
      (itemId) => itemId !== command.itemId && state.possessions.get(itemId)?.attuned === true,
    );
    if (others.length >= ATTUNED_AT_MOST)
      return reject('INVALID_ITEM', 'Attuned to three items already: end one first', {
        attunement: 'full',
      });
    if (others.some((itemId) => state.possessions.get(itemId)?.catalogId === possession.catalogId))
      return reject('INVALID_ITEM', 'Already attuned to one of these', { attunement: 'copy' });
    const refused = mayAttune(needs, sheet);
    if (refused) return reject('INVALID_ITEM', refused, { attunement: 'who' });
  } else if (entry.magic?.cursed && command.liftCurse !== true)
    return reject('INVALID_ITEM', 'A curse holds this attunement', { attunement: 'curse' });
  // A worn item gives or stops giving its Armor Class and saves.
  const worn = possession.slot;
  const ac =
    worn !== null && sheet
      ? armorClassDelta(entry, worn, sheet.abilities.dex, command.attuned)
      : possession.acDelta;
  const saves = worn !== null ? magicBonus(entry, command.attuned).saves : 0;
  const applied = sheet ? clampArmorClass(sheet.armorClass + ac - possession.acDelta) : 0;
  const events: KernelEvent[] = [
    {
      type: 'ItemAttuned',
      payload: {
        itemId: command.itemId,
        holderId: command.characterId,
        attuned: command.attuned,
        acDelta: sheet ? applied - sheet.armorClass + possession.acDelta : ac,
        saveDelta: saves,
        ...(entry.magic?.cursed && !command.attuned ? { liftedCurse: true as const } : {}),
      },
    },
  ];
  const change = (s: CharacterSheet): CharacterSheet =>
    withSaveBonus({ ...s, armorClass: applied }, saves - (possession.saveDelta ?? 0));
  return accept(...withSheet(state, command.characterId, events, change));
}

/**
 * Who an item names may attune ("by a Wizard", "by a Cleric, Druid, or Paladin", "by a
 * Spellcaster"); a species or an alignment is the DM's to judge. The words of a refusal, or null.
 */
function mayAttune(needs: string, sheet: CharacterSheet | undefined): string | null {
  if (needs === '') return null;
  const classes = CLASSES.filter((name) => new RegExp(`\\b${name}\\b`).test(needs));
  if (classes.length > 0) {
    const has = sheet?.classes.some((entry) =>
      classes.some((name) => name.toLowerCase() === entry.classId),
    );
    return has === true ? null : `Only a creature ${needs} may attune to it`;
  }
  if (/\bSpellcaster\b/.test(needs) && (sheet?.spellcasting.length ?? 0) === 0)
    return `Only a creature ${needs} may attune to it`;
  return null;
}
