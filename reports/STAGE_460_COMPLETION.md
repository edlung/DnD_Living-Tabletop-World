# Stage 460 completion — item catalog, possession and in-play item actions

Branch `claude/stage-460-items` (based on `claude/gate-07-remediation`, PR 17). ADR 0039; design `docs/STAGE_460_DESIGN.md`
(§11 lists the differences from the proposal); scope `work-orders/STAGE_460.md`. Owner decisions 2026-10-31: original
Ravenford catalog (not SRD), in-play actions included.

## Delivered

- **Catalog** (`packages/contracts/src/items/`): 30 original entries in RU and EN — armor 4, shields 2, consumables 8, gear and
  tools 16 — validated at load (schema, unique IDs, category/slot/effect consistency). Weapons stay in `@ltw/rules`.
- **Possession** (`packages/domain/src/items/`): state `possessions`, commands `GrantItem` (DM/system) and the player commands
  `EquipItem`, `UnequipItem`, `UseItem`, `GiveItem`, `DropItem`, `TakeItem`; events `ItemGranted`, `ItemEquipped`,
  `ItemUnequipped`, `ItemUsed`, `ItemTransferred`; footprints, undo restores (`possession` fact), integrity checks, premises.
  Armor class, healing and condition removal are ordinary `CharacterSheetSet` events beside the item event.
- **Knowledge and secrecy**: a carried item is perceived only by its carrier; the inventory view is the carrier's own or the
  DM's; refusals do not confirm entities (absent, hidden, carried by another and nonexistent targets answer alike); only a
  combatant is held back during an encounter, so nobody learns of a fight they are not in.
- **Server**: `GET /campaigns/:id/entities/:id/inventory` (same scoping as the sheet); commands through the existing route.
- **Client**: dock "Items" sheet (RU/EN), pick up from the scene (`take_item` context action), outcomes and refusals in words,
  styles, neutral glyph from the existing GPT UI kit (no new art; Stage 480 adds catalog pictures).
- **Tests**: 24 domain tests (grant, wear/AC, use, hand over, drop/take, undo safety, re-decision oracle, replay, concurrency,
  combat rule, perception, refusals), 4 catalog tests, 4 HTTP tests, random-command coverage, 8 browser journeys.

## Verification (run on this machine, 2026-10-31)

| Check                                                | Result                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint, format, context budget              | clean (0 over target)                                                                                                                                                                                                                                                   |
| unit                                                 | all pass (see final run in the session)                                                                                                                                                                                                                                 |
| integration (PostgreSQL)                             | 350 pass                                                                                                                                                                                                                                                                |
| browser (full suite, system Chrome)                  | 189 of 192 passed first run; 3 failures were caused by the Items dock entry crowding the DM dock (fixed: Items is not shown in the DM perspective); the 3 and the new item journeys then passed; after the last changes the item and Russian journeys (13) passed again |
| layout audit (`ui-layout-audit`) at 1440/768/390/320 | no findings in the Items sheet; one pre-existing `select-clipped` on the perspective select at 320 px                                                                                                                                                                   |
| axe at phone/tablet/desktop on the Items sheet       | 0 violations                                                                                                                                                                                                                                                            |

Not run: GitHub CI (nothing pushed), Playwright's bundled Chromium (not installed; the system Chrome was used through a local,
uncommitted config), the live-provider paths (untouched), a human playtest.

## Limits and open decisions

- No item handling by a combatant during an encounter (combat turn economy for items is a later stage); stacks move whole;
  weight is shown, never enforced; no currency, shops or crafting; a character at 0 HP cannot be healed by an item.
- A player can hand an item to another player's character without that player's consent (the receiver sees it appear).
- Campaign packages do not yet carry items (Stage 470); catalog pictures come in Stage 480. No existing campaign has items.
- `pnpm build` emits a "chunk larger than 500 kB" warning for the web bundle; it was not compared with the base branch.
