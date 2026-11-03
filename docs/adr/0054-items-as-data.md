# 0054. Items as data: the SRD's equipment and magic items in a campaign's catalog

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 650,
  decisions 6 and 18, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0039
  (item possession; its 2026-11-02 amendment lets the SRD into the catalog), ADR 0047 (weapons) and
  ADR 0050 §10 (armor) to the SRD 5.2.1's equipment and magic items; ADR 0051 §3–4 (the mechanics
  layer) applies.
- Context: the catalog held some forty items of Ravenford's own, and the DM had no screen to give
  one: items reached characters through a campaign's package. A table expects the SRD's Player's
  Handbook shelf — weapons and armor with their prices, the tools, the adventuring gear, the packs —
  and the magic items: rarity, attunement, a +1 sword, a potion of healing, a wand's charges, an
  item no one has identified yet, a curse that holds.

## Decision

1. **From the text to the catalog.** `scripts/srd/equipment.ts` reads the Equipment chapter's
   tables and entries (pages 89–103): coins, the 38 weapons (Musket and Pistol join the rules'
   weapons), the 13 armors and the Shield, the tools with their ability, use and crafts, the
   adventuring gear with its weight and price (ammunition, focuses, packs and their contents),
   tack, harness and drawn vehicles, and food and drink. Services (lodging, hirelings,
   spellcasting), mounts (creatures, in the bestiary) and ships stay text. `scripts/srd/magic-items.ts`
   reads Magic Items A–Z (pages 209–253): category, rarity, attunement and who may attune, and the
   text. The same lines give the same files; a test holds the numbers to the text.
2. **Two layers, as for spells and monsters.** The text (name, price, weight, the SRD's words) is
   `packages/rules/src/srd/{equipment,magic-items}.json`, read by the server. The catalog entries
   the World Engine applies (category, slots, stack, weight, worth, armor, shield, weapon,
   ammunition, effect, and for magic items their rarity, attunement, bonus and charges) are
   `packages/contracts/src/items/srd/*.json`, reached through `@ltw/contracts/srd-items` — the
   domain reads it; the browser bundle never carries it. Catalog ids are `srd-<slug>`, stable.
3. **One catalog per campaign.** A campaign's catalog is Ravenford's originals and the SRD's
   entries. The originals keep their own names; the test that forbade SRD names holds for them
   alone. An SRD entry's Russian name and words come with the translation pipeline (Stage 650e);
   until then the English is shown, marked as English.
4. **The DM gives items.** The DM finds an entry by name, category or rarity, and gives it to a
   character or a creature present, in a quantity when it stacks: the server makes the item and
   grants it through the World Engine as the DM's commands, once per request (as the bestiary's
   creatures, ADR 0053 §3). Its card shows the price, the weight and the SRD's text.
5. **Magic items** (parts 2 and 3 of Stage 650d): a magic weapon, armor or shield is made on a
   mundane one the DM names (a +1 Longsword is "Weapon, +1" on a Longsword); its bonus adds to
   attack and damage or to Armor Class. Attunement takes a Short Rest focused on the item, at most
   three items and one copy of each; an item that needs it gives none of its magic without it.
   Protection items add to Armor Class and saves while attuned; a Potion of Healing heals its dice.
   Charges are counted, spent by using the item and regained at the next dawn by the item's dice.
   An item may be given unidentified: its carrier sees what it looks like until a Short Rest's
   focus or Identify reveals it — never its curse. A cursed item's attunement cannot be ended
   until the DM lifts the curse (Remove Curse). What an item does beyond these stays the DM's: the
   card shows the SRD's words.

### Notes from the implementation (Stage 650d part 4, 2026-11-03)

- Identifying: the DM reveals an item at any time; its carrier's player studies it in the Short
  Rest the DM opened (the rest does not count which item was studied); a potion is known by a
  taste at any time, as the SRD says. Until then the carrier sees the base's look, or "An unknown
  magic item" of its category, and none of its magic, charges or words.
- Charges: using one is a Magic action that records the charges spent; what it casts, and the
  roll a wand makes on its last charge, stay the DM's (the card's words). The dawn is the DM's
  button on the Time sheet, since the world's clock marks no dawns yet: every item short of its
  charges rolls its dice, the server's dice through the World Engine.

## Consequences

- `ItemEntry` gains its source and, for magic items, `magic` (rarity, attunement, bonus, charges,
  curse); possession gains the base item, attunement, charges and whether its carrier knows it.
  Old histories replay unchanged: every new field is optional.
- The DM screen gains the item catalog; the inventory card shows an SRD item's words, price,
  rarity and attunement.
- Stage 650d runs in parts: the equipment and the DM's catalog; magic items with attunement and
  bonuses; charges, identifying and curses.

## Invariants affected

Preserves 1, 8 and 9: the catalog describes; the server decides and records every change of hands,
attunement and charge; a carrier sees an unidentified item as its carrier would, and only the DM
sees a curse before it shows.

## Amendment 2026-11-03 (Stage 670f, ADR 0057 §9; owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`)

A catalog entry may say how it is made (`craft`): the tools that make it, any one of them, and its
own days and materials apiece where they are not the SRD's rule (a Potion of Healing: 1 day, 25
GP). The SRD's entries take it from each tool's "Craft:" line at import (`scripts/srd/craft-tools.ts`,
an unread line stops the import); Ravenford's own name their tools by hand, and a Ravenford weapon
is made with those of the SRD weapon it fights as (`craftOf`). A Spell Scroll is scribed, not
crafted: no entry names its tool (docs/adr/0057-encounters-maps-loot.md, 670f notes).
