# 0039. Item possession: catalog, carriers and play actions

- Status: Accepted (owner product decision 2026-10-31: original Ravenford catalog; in-play actions included; technical).
- Date: 2026-10-31.
- Stage: 460. Follow-on: 470 (items in AI campaign packages), 480 (item art).
- Design: `docs/STAGE_460_DESIGN.md`; scope: `work-orders/STAGE_460.md`.

## Context

`item` was already a world entity kind, but nothing said who carried one, whether it was worn, or what using
it did. The rules catalog held only spells and one weapon.

## Decision

1. **Catalog.** Static entries (`@ltw/contracts` `ITEM_CATALOG`, ~30 original Ravenford items in RU and EN) keyed by a stable ASCII
   slug. The data lives in contracts, not `@ltw/rules`, because the kernel validates and applies it while `@ltw/domain`
   depends on contracts only. A catalog entry describes a kind of thing, never a particular world object. Weapons keep their
   own definitions in `@ltw/rules`. No SRD item text or names are used.
2. **Possession.** `WorldState.possessions` maps an item entity to `{ catalogId, holderId, quantity, slot, acDelta }`.
   `holderId = null` means the item lies where it is placed. A held item's old placement is ignored; a dropped item is
   placed with an ordinary `EntityPlaced` event.
3. **Commands.** `GrantItem` (DM or system). Player commands for the controlled character: `EquipItem`, `UnequipItem`,
   `UseItem`, `GiveItem`, `DropItem`, `TakeItem`. They are `PLAYER_COMMAND_TYPES`, so they record premises and the
   controller authority, and a DM may substitute.
4. **Events.** `ItemGranted`, `ItemEquipped`, `ItemUnequipped`, `ItemUsed`, `ItemTransferred`. Introduced at the dependency
   contract version; no earlier version exists. Existing histories replay unchanged because the new state starts empty.
5. **Sheet effects use the existing event.** Armor class, healing and condition removal are recorded as an ordinary
   `CharacterSheetSet` beside the item event, so undo (restores `sheet` and `possession` facts), replay and footprints need no
   special case. The armor class an item added is stored in `acDelta` and reversed on removal.
6. **Footprints.** Each item event reads the item's possession, the carrier's existence and, where the sheet is a premise,
   `sheet:<holder>`; equip and unequip read and write `equipment:<holder>` (slot occupancy). Transfers read both placements.
7. **Invariants** (checked by `itemViolations`): a possession belongs to an item entity; the holder is a character or NPC;
   one item per holder and slot; a worn item sits in a slot its entry allows; quantity 0 if and only if the entity is
   destroyed; only stackable entries hold more than one unit; unworn items add no armor class.
8. **Limits of this stage, stated plainly.** No item handling during an encounter (`COMBAT_ALREADY_ACTIVE`): combat turn
   economy for items is a later stage. A stack moves whole (no partial split). Weight is shown, never enforced. No currency,
   shops or crafting. A character at 0 HP cannot be healed by an item.
9. **Knowledge.** Item possession is world fact. A viewer sees a character's carried items only through the same
   perception rules as other entities; the player view lists only the viewer's own items (Stage 460 server DTO).

## Consequences

Item commands add a kernel event family; the re-decision oracle and random-command tests cover them. Stage 470 may reference
catalog IDs from campaign packages; Stage 480 attaches art by catalog ID.
