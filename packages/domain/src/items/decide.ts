import { armorWeight, effectiveMaximum, type CharacterSheet } from '@ltw/contracts';

import { isCombatant } from '../combat/records.ts';
import { poolDice } from '../combat/port.ts';
import { reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { adjacentInEncounter } from './economy.ts';
import {
  carrier,
  item,
  mayHandle,
  ownItem,
  played,
  SELF,
  withSaveBonus,
  withSheet,
} from './handling.ts';
import {
  armorClassDelta,
  clampArmorClass,
  entryOf,
  magicBonus,
  possessionOf,
  wornIn,
  type Possession,
} from './records.ts';
import { decideSpendCharges } from './charges.ts';

/**
 * Item commands (docs/adr/0039-item-possession.md). An item changes hands or
 * state only through these decisions. Anything that changes a sheet (armor
 * class, hit points, conditions) is recorded as an ordinary `CharacterSheetSet`
 * beside the item event, so undo and replay need no special case. Giving one is
 * `grant.ts`'s; the checks every decision shares, `handling.ts`'s.
 */
export { decideAttuneItem } from './attune.ts';
export { decideDawnRecharge, decideIdentifyItem } from './charges.ts';
export { decideGrantItem, grantRefusal } from './grant.ts';
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
  const attuned = own.possession.attuned === true;
  const requested = sheet ? armorClassDelta(entry, command.slot, sheet.abilities.dex, attuned) : 0;
  const applied = sheet ? clampArmorClass(sheet.armorClass + requested) - sheet.armorClass : 0;
  // A Ring of Protection's +1 to saves, worn and attuned (docs/adr/0054-items-as-data.md §5).
  const saves = sheet ? magicBonus(entry, attuned).saves : 0;
  if (command.slot === 'body' && isCombatant(state, command.characterId))
    return reject('INVALID_ITEM', 'Armor cannot be changed during an encounter');
  return played(
    state,
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
            ...(saves === 0 ? {} : { saveDelta: saves }),
          },
        },
      ],
      (s) => {
        const armored = withSaveBonus(
          applied === 0 ? s : { ...s, armorClass: s.armorClass + applied },
          saves,
        );
        // What the rules need of body armor (docs/adr/0050-the-world-around.md §10).
        const armor = command.slot === 'body' ? entry.armor : undefined;
        return armor
          ? {
              ...armored,
              wornArmor: {
                weight: armorWeight(armor.dexCap),
                ...(armor.strength === undefined ? {} : { strength: armor.strength }),
                ...(armor.stealthDisadvantage ? { stealthDisadvantage: true as const } : {}),
              },
            }
          : armored;
      },
    ),
    command.slot === 'offhand' ? 'action' : 'bonus',
  );
}

export function decideUnequipItem(
  state: WorldState,
  command: ResolvedCommandOf<'UnequipItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const { slot, acDelta, saveDelta = 0 } = own.possession;
  if (slot === null) return reject('NO_EFFECT', `"${command.itemId}" is not worn`);
  if (slot === 'body' && isCombatant(state, command.characterId))
    return reject('INVALID_ITEM', 'Armor cannot be changed during an encounter');
  return played(
    state,
    command.characterId,
    SELF,
    withSheet(
      state,
      command.characterId,
      [
        {
          type: 'ItemUnequipped',
          payload: {
            itemId: command.itemId,
            holderId: command.characterId,
            slot,
            acDelta,
            ...(saveDelta === 0 ? {} : { saveDelta }),
          },
        },
      ],
      (s) => {
        const armorClass = clampArmorClass(s.armorClass - acDelta);
        const next = withSaveBonus(
          armorClass === s.armorClass ? s : { ...s, armorClass },
          -saveDelta,
        );
        if (slot !== 'body' || next.wornArmor === undefined) return next;
        const bare = { ...next };
        delete bare.wornArmor;
        return bare;
      },
    ),
    slot === 'offhand' ? 'action' : 'bonus',
  );
}

export function decideUseItem(state: WorldState, command: ResolvedCommandOf<'UseItem'>): Decision {
  // A magic item's charges (docs/adr/0054-items-as-data.md §5).
  if (command.charges !== undefined) return decideSpendCharges(state, command, command.charges);
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const effect = entryOf(own.possession)?.effect;
  if (!effect || own.possession.quantity < 1)
    return reject('INVALID_ITEM', `"${command.itemId}" cannot be used`);
  const sheet = state.characterSheets.get(command.characterId);
  let change: (s: CharacterSheet) => CharacterSheet = (s) => s;
  let healed: { rolls: number[]; bonus: number; total: number } | undefined;
  if (effect.kind === 'heal' || effect.kind === 'heal-dice') {
    if (!sheet) return reject('NO_CHARACTER_SHEET', 'Healing needs a character sheet');
    if (sheet.hitPoints.current <= 0)
      return reject(
        'INVALID_ITEM',
        'A character at 0 hit points needs care that this item cannot give',
      );
    // Full up to the maximum as an effect may have lowered it (docs/adr/0048-hit-points.md §2).
    if (sheet.hitPoints.current >= effectiveMaximum(sheet.hitPoints))
      return reject('NO_EFFECT', 'Already at full hit points');
    // A potion of healing rolls its dice (docs/adr/0054-items-as-data.md §5).
    if (effect.kind === 'heal-dice') {
      const dice = poolDice(command.resolution.entropy);
      const rolls = Array.from({ length: effect.count }, () => dice.roll(effect.sides));
      const total = rolls.reduce((sum, roll) => sum + roll, effect.bonus);
      healed = { rolls, bonus: effect.bonus, total };
    }
    const amount = effect.kind === 'heal' ? effect.amount : (healed?.total ?? 0);
    change = (s) => ({
      ...s,
      hitPoints: {
        ...s.hitPoints,
        current: Math.min(effectiveMaximum(s.hitPoints), s.hitPoints.current + amount),
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
      payload: {
        itemId: command.itemId,
        holderId: command.characterId,
        remaining,
        ...(healed ? { healed } : {}),
      },
    },
  ];
  if (remaining === 0)
    events.push({
      type: 'EntityStatusChanged',
      payload: { entityId: command.itemId, from: 'active', to: 'destroyed' },
    });
  return played(
    state,
    command.characterId,
    SELF,
    withSheet(state, command.characterId, events, change),
    effect.kind === 'narrative' ? 'action' : 'bonus',
  );
}

/**
 * How much of a stack moves, and the events that make it a thing of its own when it is part:
 * a new item entity (its ID drawn by the engine) takes that quantity from the stack.
 */
function portion(
  state: WorldState,
  command: {
    readonly itemId: string;
    readonly quantity?: number | undefined;
    readonly characterId: string;
    readonly resolution: { readonly ids: readonly string[] };
  },
  possession: Possession,
):
  | {
      readonly ok: true;
      readonly itemId: string;
      readonly quantity: number;
      readonly events: KernelEvent[];
    }
  | (Decision & { ok: false }) {
  const wanted = command.quantity ?? possession.quantity;
  if (wanted > possession.quantity)
    return reject('INVALID_ITEM', 'Not that many are carried', { itemId: command.itemId });
  if (wanted === possession.quantity)
    return { ok: true, itemId: command.itemId, quantity: wanted, events: [] };
  if (!entryOf(possession)?.stackable)
    return reject('INVALID_ITEM', 'Only a stack can be divided', { itemId: command.itemId });
  const newItemId = command.resolution.ids[0];
  const source = state.entities.get(command.itemId);
  if (newItemId === undefined || !source)
    return reject('INVALID_ITEM', 'The stack cannot be divided now', { itemId: command.itemId });
  return {
    ok: true,
    itemId: newItemId,
    quantity: wanted,
    events: [
      {
        type: 'EntityCreated',
        payload: {
          entityId: newItemId,
          kind: 'item',
          name: source.name,
          description: source.description,
          existsSince: source.existsSince,
          location: null,
        },
      },
      {
        type: 'ItemSplit',
        payload: {
          itemId: command.itemId,
          newItemId,
          holderId: command.characterId,
          quantity: wanted,
        },
      },
    ],
  };
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
  // Someone who is not here, does not exist, or cannot be perceived: one answer for all.
  const here = own.actor.placement?.locationId;
  const recipient = state.entities.get(command.toHolderId);
  if (here === undefined || here !== recipient?.placement?.locationId)
    return reject('NOT_PRESENT', `"${command.toHolderId}" is not here`, {
      entityId: command.toHolderId,
    });
  const to = carrier(state, command.toHolderId);
  if (!to.ok) return to;
  // In a fight the receiver must stand beside the giver on the battlefield.
  if (
    isCombatant(state, command.characterId) &&
    !adjacentInEncounter(state, command.characterId, command.toHolderId)
  )
    return reject('NOT_PRESENT', `"${command.toHolderId}" is not here`, {
      entityId: command.toHolderId,
    });
  const part = portion(state, command, own.possession);
  if (!part.ok) return part;
  return played(
    state,
    command.characterId,
    [{ kind: 'perceived', entityId: command.toHolderId }],
    [
      ...part.events,
      {
        type: 'ItemTransferred',
        payload: {
          itemId: part.itemId,
          from: command.characterId,
          to: command.toHolderId,
          catalogId: own.possession.catalogId,
          quantity: part.quantity,
        },
      },
    ],
    'bonus',
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
  const part = portion(state, command, own.possession);
  if (!part.ok) return part;
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }],
    [
      ...part.events,
      {
        type: 'ItemTransferred',
        payload: {
          itemId: part.itemId,
          from: command.characterId,
          to: null,
          catalogId: own.possession.catalogId,
          quantity: part.quantity,
        },
      },
      {
        type: 'EntityPlaced',
        payload: {
          entityId: part.itemId,
          locationId: here,
          since: state.clock,
          previousLocationId: state.entities.get(part.itemId)?.placement?.locationId ?? null,
        },
      },
    ],
    'free',
  );
}

export function decideTakeItem(
  state: WorldState,
  command: ResolvedCommandOf<'TakeItem'>,
): Decision {
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  // Things on the ground are not on the battlefield: nothing is picked up in the middle of a fight.
  if (isCombatant(state, command.characterId))
    return reject('COMBAT_ALREADY_ACTIVE', 'Items cannot be picked up while an encounter runs');
  // What is not lying here, whether absent, hidden, carried by someone else or no item: one answer.
  const here = actor.value.placement?.locationId;
  const possession = possessionOf(state, command.itemId);
  const lying = state.entities.get(command.itemId);
  const seen = lying?.kind === 'item' && lying.placement?.locationId === here;
  if (here === undefined || !seen || (possession?.holderId ?? null) !== null)
    return reject('NOT_PRESENT', `"${command.itemId}" is not here`, { itemId: command.itemId });
  const thing = item(state, command.itemId);
  if (!thing.ok) return thing;
  return played(
    state,
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
    'free',
  );
}
