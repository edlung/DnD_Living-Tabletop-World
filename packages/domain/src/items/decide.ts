import { catalogEntry, type CharacterSheet } from '@ltw/contracts';

import { premisesEvent } from '../investigation/acting.ts';
import type { Premise } from '../investigation/events.ts';
import { findEntity, type Lookup } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { EntityState, WorldState } from '../kernel/state.ts';
import {
  armorClassDelta,
  clampArmorClass,
  entryOf,
  possessionOf,
  wornIn,
  type Possession,
} from './records.ts';

/**
 * Item commands (docs/adr/0039-item-possession.md). An item changes hands or
 * state only through these decisions. Anything that changes a sheet (armor
 * class, hit points, conditions) is recorded as an ordinary `CharacterSheetSet`
 * beside the item event, so undo and replay need no special case.
 */
const CARRIER_KINDS = new Set(['character', 'npc']);

function carrier(state: WorldState, id: string): Lookup<EntityState> {
  const found = findEntity(state, id);
  if (!found.ok) return found;
  if (!CARRIER_KINDS.has(found.value.kind))
    return reject('INVALID_ITEM', `Entity "${id}" cannot carry items`, { entityId: id });
  if (found.value.status !== 'active')
    return reject('ACTOR_DEAD', `"${id}" cannot handle items`, { entityId: id });
  return found;
}

function item(state: WorldState, id: string): Lookup<EntityState> {
  const found = findEntity(state, id);
  if (!found.ok) return found;
  if (found.value.kind !== 'item')
    return reject('INVALID_ITEM', `Entity "${id}" is not an item`, { itemId: id });
  if (found.value.status !== 'active')
    return reject('ENTITY_DESTROYED', `Item "${id}" is destroyed`, { itemId: id });
  return found;
}

/** Refusals shared by every play action of a character: dead, unconscious, in combat. */
function mayHandle(state: WorldState, characterId: string): Lookup<EntityState> {
  const actor = carrier(state, characterId);
  if (!actor.ok) return actor;
  if (state.encounter !== null)
    return reject('COMBAT_ALREADY_ACTIVE', 'Items cannot be handled while an encounter runs');
  if (state.characterSheets.get(characterId)?.conditions.includes('unconscious'))
    return reject('ACTOR_INCAPACITATED', `"${characterId}" is unconscious`);
  return actor;
}

/** The acting character's own, active item. */
function ownItem(
  state: WorldState,
  characterId: string,
  itemId: string,
): { ok: true; possession: Possession; actor: EntityState } | (Decision & { ok: false }) {
  const actor = mayHandle(state, characterId);
  if (!actor.ok) return actor;
  const thing = item(state, itemId);
  if (!thing.ok) return thing;
  const possession = possessionOf(state, itemId);
  if (possession?.holderId !== characterId)
    return reject('INVALID_ITEM', `"${characterId}" does not carry "${itemId}"`, { itemId });
  return { ok: true, possession, actor: actor.value };
}

/** A player's item command: the premises it relied on come first (Gate 02, G02-H02). */
const played = (
  characterId: string,
  premises: readonly Premise[],
  events: readonly KernelEvent[],
): Decision => accept(premisesEvent(characterId, premises), ...events);

const SELF: readonly Premise[] = [{ kind: 'self' }, { kind: 'sheet' }];

/** The item event(s), plus a sheet change when the sheet exists and the change alters it. */
function withSheet(
  state: WorldState,
  characterId: string,
  events: KernelEvent[],
  change: (sheet: CharacterSheet) => CharacterSheet,
): KernelEvent[] {
  const sheet = state.characterSheets.get(characterId);
  if (!sheet) return events;
  const next = change(sheet);
  return next === sheet
    ? events
    : [...events, { type: 'CharacterSheetSet', payload: { entityId: characterId, sheet: next } }];
}

export function decideGrantItem(
  state: WorldState,
  command: ResolvedCommandOf<'GrantItem'>,
): Decision {
  const thing = item(state, command.itemId);
  if (!thing.ok) return thing;
  const holder = carrier(state, command.holderId);
  if (!holder.ok) return holder;
  if (possessionOf(state, command.itemId))
    return reject('INVALID_ITEM', `Item "${command.itemId}" already has a holder or place`);
  const catalogId = command.catalogId ?? null;
  const entry = catalogId === null ? undefined : catalogEntry(catalogId);
  if (catalogId !== null && !entry)
    return reject('INVALID_ITEM', `Unknown catalog item "${catalogId}"`, { catalogId });
  if (command.quantity > 1 && !entry?.stackable)
    return reject('INVALID_ITEM', 'Only a stackable catalog item can be granted in quantity');
  return accept({
    type: 'ItemGranted',
    payload: {
      itemId: command.itemId,
      holderId: command.holderId,
      catalogId,
      quantity: command.quantity,
    },
  });
}

export function decideEquipItem(
  state: WorldState,
  command: ResolvedCommandOf<'EquipItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const entry = entryOf(own.possession);
  if (!entry?.slots.includes(command.slot))
    return reject('INVALID_ITEM', `"${command.itemId}" cannot be worn in ${command.slot}`, {
      slot: command.slot,
    });
  if (own.possession.slot !== null)
    return reject('NO_EFFECT', `"${command.itemId}" is already worn`);
  const occupant = wornIn(state, command.characterId, command.slot);
  if (occupant !== null)
    return reject('INVALID_ITEM', `The ${command.slot} slot is taken by "${occupant}"`, {
      slot: command.slot,
      occupant,
    });
  const sheet = state.characterSheets.get(command.characterId);
  const affectsArmor = entry.armor !== undefined || entry.shieldBonus !== undefined;
  if (affectsArmor && !sheet)
    return reject('NO_CHARACTER_SHEET', "Armor needs the wearer's character sheet");
  const requested = sheet ? armorClassDelta(entry, command.slot, sheet.abilities.dex) : 0;
  const applied = sheet ? clampArmorClass(sheet.armorClass + requested) - sheet.armorClass : 0;
  return played(
    command.characterId,
    SELF,
    withSheet(
      state,
      command.characterId,
      [
        {
          type: 'ItemEquipped',
          payload: {
            itemId: command.itemId,
            holderId: command.characterId,
            slot: command.slot,
            acDelta: applied,
          },
        },
      ],
      (s) => (applied === 0 ? s : { ...s, armorClass: s.armorClass + applied }),
    ),
  );
}

export function decideUnequipItem(
  state: WorldState,
  command: ResolvedCommandOf<'UnequipItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const { slot, acDelta } = own.possession;
  if (slot === null) return reject('NO_EFFECT', `"${command.itemId}" is not worn`);
  return played(
    command.characterId,
    SELF,
    withSheet(
      state,
      command.characterId,
      [
        {
          type: 'ItemUnequipped',
          payload: { itemId: command.itemId, holderId: command.characterId, slot, acDelta },
        },
      ],
      (s) => {
        const armorClass = clampArmorClass(s.armorClass - acDelta);
        return armorClass === s.armorClass ? s : { ...s, armorClass };
      },
    ),
  );
}

export function decideUseItem(state: WorldState, command: ResolvedCommandOf<'UseItem'>): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const effect = entryOf(own.possession)?.effect;
  if (!effect || own.possession.quantity < 1)
    return reject('INVALID_ITEM', `"${command.itemId}" cannot be used`);
  const sheet = state.characterSheets.get(command.characterId);
  let change: (s: CharacterSheet) => CharacterSheet = (s) => s;
  if (effect.kind === 'heal') {
    if (!sheet) return reject('NO_CHARACTER_SHEET', 'Healing needs a character sheet');
    if (sheet.hitPoints.current <= 0)
      return reject(
        'INVALID_ITEM',
        'A character at 0 hit points needs care that this item cannot give',
      );
    if (sheet.hitPoints.current >= sheet.hitPoints.max)
      return reject('NO_EFFECT', 'Already at full hit points');
    change = (s) => ({
      ...s,
      hitPoints: {
        ...s.hitPoints,
        current: Math.min(s.hitPoints.max, s.hitPoints.current + effect.amount),
      },
    });
  } else if (effect.kind === 'removeCondition') {
    if (!sheet?.conditions.includes(effect.condition))
      return reject('NO_EFFECT', `Not ${effect.condition}`);
    change = (s) => ({ ...s, conditions: s.conditions.filter((c) => c !== effect.condition) });
  }
  const remaining = own.possession.quantity - 1;
  const events: KernelEvent[] = [
    {
      type: 'ItemUsed',
      payload: { itemId: command.itemId, holderId: command.characterId, remaining },
    },
  ];
  if (remaining === 0)
    events.push({
      type: 'EntityStatusChanged',
      payload: { entityId: command.itemId, from: 'active', to: 'destroyed' },
    });
  return played(command.characterId, SELF, withSheet(state, command.characterId, events, change));
}

export function decideGiveItem(
  state: WorldState,
  command: ResolvedCommandOf<'GiveItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  if (own.possession.slot !== null)
    return reject('INVALID_ITEM', 'Take the item off before handing it over');
  if (command.toHolderId === command.characterId)
    return reject('NO_EFFECT', 'The item is already with its holder');
  const to = carrier(state, command.toHolderId);
  if (!to.ok) return to;
  const here = own.actor.placement?.locationId;
  if (here === undefined || here !== to.value.placement?.locationId)
    return reject('NOT_PRESENT', `"${command.toHolderId}" is not here`, {
      entityId: command.toHolderId,
    });
  return played(
    command.characterId,
    [{ kind: 'perceived', entityId: command.toHolderId }],
    [
      {
        type: 'ItemTransferred',
        payload: {
          itemId: command.itemId,
          from: command.characterId,
          to: command.toHolderId,
          catalogId: own.possession.catalogId,
          quantity: own.possession.quantity,
        },
      },
    ],
  );
}

export function decideDropItem(
  state: WorldState,
  command: ResolvedCommandOf<'DropItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  if (own.possession.slot !== null)
    return reject('INVALID_ITEM', 'Take the item off before dropping it');
  const here = own.actor.placement?.locationId;
  if (here === undefined) return reject('NOT_PRESENT', 'There is nowhere to drop it');
  return played(
    command.characterId,
    [{ kind: 'self' }],
    [
      {
        type: 'ItemTransferred',
        payload: {
          itemId: command.itemId,
          from: command.characterId,
          to: null,
          catalogId: own.possession.catalogId,
          quantity: own.possession.quantity,
        },
      },
      {
        type: 'EntityPlaced',
        payload: {
          entityId: command.itemId,
          locationId: here,
          since: state.clock,
          previousLocationId: state.entities.get(command.itemId)?.placement?.locationId ?? null,
        },
      },
    ],
  );
}

export function decideTakeItem(
  state: WorldState,
  command: ResolvedCommandOf<'TakeItem'>,
): Decision {
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  const thing = item(state, command.itemId);
  if (!thing.ok) return thing;
  const possession = possessionOf(state, command.itemId);
  if (possession && possession.holderId !== null)
    return reject('INVALID_ITEM', `"${command.itemId}" is already carried`);
  const here = actor.value.placement?.locationId;
  if (here === undefined || thing.value.placement?.locationId !== here)
    return reject('NOT_PRESENT', `"${command.itemId}" is not here`, { itemId: command.itemId });
  return played(
    command.characterId,
    [{ kind: 'perceived', entityId: command.itemId }],
    [
      {
        type: 'ItemTransferred',
        payload: {
          itemId: command.itemId,
          from: null,
          to: command.characterId,
          catalogId: possession?.catalogId ?? null,
          quantity: possession?.quantity ?? 1,
        },
      },
    ],
  );
}
