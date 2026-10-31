# Stage 460 design — item catalog, possession and in-play item actions

Status: **PROPOSED, awaiting owner authorization to implement.**
Owner decisions (2026-10-31): catalog content is **original Ravenford content, not SRD-derived**
(option A); scope includes **in-play actions** (equip, use, give, take), not display only.

Stages 470 (items in AI campaign packages) and 480 (item art) are separate and depend on this
stage's catalog IDs and possession model. They are outlined in §9 only so 460 does not block them.

## 1. Findings in the current code (verified 2026-10-31)

- `item` is already a world entity kind (`packages/domain/src/kernel/state.ts`,
  `contracts/kernel/world-commands.ts`) and a campaign-package kind
  (`contracts/campaign/generation.ts`). Items can be examined and used as clues
  (`domain/investigation/examine.ts`, `authoring.ts`).
- The rules catalog (`packages/rules/src/catalog.ts`, 107 lines) holds only `SPELLS` and `WEAPONS`
  (one weapon: longbow). Character sheets reference `weapons: ["longbow"]` by ID.
- **No possession model exists in the kernel**: no command or event says who carries, wears or
  owns an item. `visual/presentation.ts` reads an `equipment` list from a held character view, and
  the UI has no inventory or equip surface (STAGE_320_DESIGN §53 deferred it).
- Therefore possession is a **new kernel command/event family**. It touches event versions, replay,
  undo/history and projections, so ADR 0038-style care and a new ADR (0039) are required.

## 2. Terms

- **Catalog entry** — static rules data keyed by `ItemId` (e.g. `ravenford.healing-draught`). It
  describes a _kind_ of thing. It never claims to be a particular world object.
- **Item entity** — a world entity (`kind: item`) that optionally references a catalog entry
  (`catalogId`). Unique story objects (a sealed letter) have no catalog entry.
- **Stack** — N interchangeable units of one catalog entry carried by one holder.
- **Possession** — the current relation of an item entity or stack to a holder or location.

## 3. Catalog (packages/rules)

New directory `packages/rules/src/items/`, one file per category, each ≤ 500 lines:
`armor.ts`, `shields.ts`, `consumables.ts`, `gear.ts`, `tools.ts`, `index.ts` (registry,
`ITEMS`, `ItemId`, lookup, validation). Weapons stay in `catalog.ts`; the registry re-exports a
unified `catalogEntry(id)` so callers need not care.

Entry shape (all fields required unless marked):

| Field                       | Meaning                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `itemId`                    | stable ASCII slug, never reused or renamed after release                                                    |
| `category`                  | `armor`, `shield`, `consumable`, `gear`, `tool`, `weapon`                                                   |
| `weightLb`, `valueCp`       | integers; value in copper                                                                                   |
| `stackable`, `maxStack`     | stacking rules                                                                                              |
| `slots`                     | equip slots it may occupy (`body`, `offhand`, `head`, `hands`, `feet`, `cloak`, `neck`, `ring`, `mainhand`) |
| `armor` (optional)          | `baseAc`, `dexCap`, `stealthDisadvantage`, `minStr`                                                         |
| `effect` (optional)         | consumable effect, a closed typed union (§5)                                                                |
| `nameKey`, `descriptionKey` | RU/EN dictionary keys; no prose in code                                                                     |

Content is **original** to the Ravenford setting: an initial set of about 30 entries (e.g. «зелье
лесного бальзама», «плащ караванщика», «стёганка гильдии»), authored for this project. No SRD item
names or stat blocks are copied. Rules _mechanics_ (AC formula, advantage) already in the rules
package are reused as the project already uses them.

Validation (unit + property tests): unique IDs, closed category/slot sets, positive integers,
effect shape per category, dictionary keys present in RU and EN, no entry text in code.

## 4. Possession model (kernel, packages/domain)

New commands and events (names indicative, finalized in ADR 0039):

- `GrantItem { itemEntityId | catalogId+quantity, holderId }` — creates/assigns (DM or system).
- `TransferItem { itemEntityId, quantity, fromHolderId, toHolderId | locationId }` — give, drop,
  take. Atomic; quantity splits and merges stacks.
- `EquipItem { itemEntityId, holderId, slot }` / `UnequipItem { itemEntityId, holderId }`.
- `ConsumeItem { itemEntityId, holderId, quantity }` — decrements; effect resolved by the rules
  layer, not by the command.

Invariants:

1. An item has **exactly one** possession state: held by one character/NPC, or placed at a
   location, or destroyed. Projections check this (integrity report).
2. Equipped implies held by the same holder; one item per slot; slot must be in the entry's `slots`.
3. Quantity never negative; stacks never exceed `maxStack`; transfers conserve total quantity.
4. Mutations only through commands accepted by the World Engine; no direct state writes. AI may
   propose only; AI output is never possession truth until confirmed (ADR 0038 stays authority).
5. History, undo, replay and digests include possession. New event versions follow
   `event-versions.ts` rules; **old logs replay unchanged** (migration of event upcasting tested).
6. Presence honesty: an NPC's or other character's carried items are visible to a viewer only if
   that viewer's knowledge allows (seen, examined, told). Hidden items (concealed in a pack) stay
   out of player DTOs. Knowledge boundary tests extend to item contents.

## 5. In-play actions (packages/context + apps/server/live)

Actions are generated by the context engine only when legal, like existing combat/investigation
actions:

- **Equip/unequip** — out of combat free; in combat costs the rules' interaction (one object
  interaction per turn; donning armor not allowed in combat). Armor changes recompute AC through
  the existing AC derivation; fighting-style and sheet AC (17 for Mira) must stay consistent.
- **Use consumable** — typed effect union, initial closed set: `heal { dice, bonus }`,
  `removeCondition { condition }`, `grantTempHp { amount }`, `narrative` (no mechanics; DM
  narrates). Effects resolve through existing rules/combat paths and are replayable.
- **Give / take / drop** — need adjacency or same-location; recipient consent is not automated
  between players in this stage (the giver acts, the receiver is notified); NPC acceptance is a DM
  matter, not an automatic mutation.
- **Examine** — existing investigation path, now reading item state.

Every action goes through the same DM-confirmation and journalling rules as other play actions.

## 6. UI (apps/web)

- Inventory sheet on the character view: grouped by category, weight total, equip slots, stack
  counts, RU/EN. Sheets rise over the lower area like the existing dock sheets (Stage 320 §131).
- Item cards show catalog description and, when it is a world object, its entity state.
  The catalog never stands in for a world image: until Stage 480 art exists, a neutral
  placeholder glyph and a text note are shown (honesty rule, STAGE_320 §107).
- Full states: empty, loading, error, over-capacity warning, disabled-with-reason actions.
- Keyboard-complete, screen-reader labels, 44 px targets, four widths (1440/768/390 + wide),
  light and dark, `ui-layout-audit` and axe clean. UX pass with the design/ISD plugins.
- The deferred-loading pattern from Stage 450 is kept: the inventory chunk loads on demand.

## 7. Persistence and migrations

- New migration `0025` (next free after 0024) for any projection tables; event log is the source
  of truth and projections rebuild from it.
- No default-DB mutation during development; tests use isolated throwaway databases and clean up
  (shared dev PG is near `max_connections`; new tests must not add parallel load).

## 8. Verification plan

Unit and property tests for the catalog and possession invariants (conservation, single
possession, slot rules), replay/undo/digest parity, old-log replay, integration tests on
PostgreSQL for commands and projections, knowledge-boundary tests for hidden items, browser e2e for
equip/use/give/drop (RU and EN), layout/axe at four widths, context budget check, `pnpm validate`
and a full isolated run. Own adversarial pass: duplication exploits (concurrent transfer), stack
overflow, equip-in-combat abuse, AI-proposed possession leaks, hidden-item disclosure,
cross-campaign catalog ID spoofing, old-event replay breakage.

## 9. Follow-on stages (outline only)

- **470** — campaign package gains starting equipment, loot, key and clue items referencing
  catalog IDs; generation validator rejects unknown IDs and impossible possession; preview shows
  items per audience; edit/adopt/activate carry possession through bootstrap atomically.
- **480** — GPT art per catalog ID (originals in the art archive, manifest, byte-reproducible
  build), world-object images through the existing asset pipeline.

## 10. Risks and open questions for the owner

1. Kernel event additions are the highest-risk part (replay/history). Mitigation: ADR 0039 first,
   old-log replay tests before UI work.
2. Content volume (~30 entries RU/EN) is mine to author; the owner may want to review names.
3. Currency/shop/trade is **out of scope** (value is data only). Say if you want it later.
4. Encumbrance is displayed (weight total) but not enforced unless the owner asks.

## 11. As implemented (differences from the proposal above)

- The catalog data lives in `@ltw/contracts` (`packages/contracts/src/items/`), not `@ltw/rules`: the kernel validates and
  applies it and `@ltw/domain` does not depend on `@ltw/rules`. Names and descriptions are RU/EN data fields of each entry.
  It has 30 entries (armor 4, shields 2, consumables 8, gear and tools 16). Weapons stay in `@ltw/rules`.
- No separate `migration 0025`: possession is canonical event-sourced state, rebuilt from the log.
- Only a **combatant** is refused item handling during an encounter; someone outside the fight is not (Gate 03, G03-H06:
  a non-combatant must not learn that a fight runs).
- Healing is a fixed amount per catalog entry (deterministic, no dice); a character at 0 HP cannot be healed by an item.
- A stack moves whole; there is no partial split. Dropping places the item where the character stands; picking up needs it
  placed in the same location.
- Equip/unequip adjust armor class as an ordinary `CharacterSheetSet` beside the item event; body armor replaces the
  unarmored base (10 + Dexterity), a shield adds its bonus. Armor and shield equips are refused while the wearer fights.
- Items on the scene: `take_item` is a server-listed context action; the pack is the dock's Items sheet.
