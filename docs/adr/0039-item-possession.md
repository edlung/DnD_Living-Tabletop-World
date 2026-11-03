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

## Amendment 2026-10-31 (Stages 470–480)

- Campaign packages carry optional `possessions` rows (`item`, `holder`, `catalog?`, `quantity`); the compiler validates them and
  the bootstrap grants them atomically. Items start carried, never worn. The field is additive, so stored revisions are valid.
- Item pictures are keyed by catalog ID in the UI kit (`catalog/items/<id>.webp`); an item without a picture shows the neutral
  glyph.

## Amendment 2026-10-31 (Stage 490)

- A combatant handles items on its own turn only. Costs: potion or worn-gear change = Bonus Action; shield or a mundane use = Action;
  handing over = Bonus Action beside the receiver; dropping = free; body armor and picking up are refused during an encounter.
  The turn is spent by a `CombatantUpdated` event beside the item event.
- `GiveItem`/`DropItem` take an optional `quantity` (part of a stack): `EntityCreated` for a new item entity, `ItemSplit`, then
  `ItemTransferred` of the new item. Total quantity is conserved.

Owner decision 2026-10-31: a hand-over between players takes effect at once, with no consent step for the receiver.

## Amendment 2026-11-01 (Stage 520, owner-delegated: `reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`)

Weapons and coins join the catalog. A weapon item names the SRD 5.2.1 weapon it fights as
(`weapon`); a character attacks with the weapon items it holds in a hand as well as the weapons its
sheet lists (`wieldedWeapons`, `@ltw/combat` legality); finesse takes the better of Strength and
Dexterity. Coins (crowns, marks, pennies) are stackable catalog items. Stacks stay at most 99 units:
the event schemas do not change. The inventory UI is a paper doll, a bag and an item card.

## Amendment 2026-11-02 (Stage 650, ADR 0051; owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`, decision 18)

The catalog stops being original only. The SRD 5.2.1's equipment and magic items enter a
campaign's catalog beside Ravenford's originals, with the SRD's attribution (`NOTICE.md`, the
About page); Ravenford's originals keep their own names, and the test that forbade SRD names
holds for them alone (Stage 650d).

## Amendment 2026-11-03 (Stage 660e, ADR 0056 §3; owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`, decision 16)

§8's "weight is shown, never enforced" is now the campaign's option: shown by default, or enforced
as SRD 5.2.1's Carrying Capacity says — a load past what Strength carries leaves a Speed of 5 ft,
one past twice it a Speed of 0 (docs/adr/0056-characters-from-the-srd.md, 660e notes).

## Amendment 2026-11-03 (Stage 670e, ADR 0057 §7; owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`)

§7's holder is a character, an NPC or a creature, or the party's stash (`PARTY_STASH`, no entity);
`GrantItem` to a place leaves the item lying there with no holder. What a creature or NPC that fell
in a fight carried, unworn, lies where the fight was once it ends; coins shared out
(`SplitCoins`) are minted anew in stacks that may hold more than 99
(docs/adr/0057-encounters-maps-loot.md, 670e notes).

## Amendment 2026-11-03 (Stage 670f, ADR 0057 §8; owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`)

A possession may be a merchant's wares (`forSale`): set when the DM gives an NPC an item to sell
or a merchant buys one, cleared when it changes hands otherwise. Coins spent in trade are pooled
across the buyer's coinages and the change minted in its home coinage; coins paid add to the
payee's stacks (docs/adr/0057-encounters-maps-loot.md, 670f notes).
