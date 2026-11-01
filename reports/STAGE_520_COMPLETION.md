# Stage 520 completion — inventory 2.0, weapons and coins

Work order `work-orders/STAGE_520.md`; ADR 0039 amendment (below); 2026-11-01.

## What changed

- Contracts: `WEAPON_IDS` grows to 14; item entries name their rules weapon (`weapon`); category
  `coins`; the inventory view carries worth, armor, shield bonus and weapon, and the server adds the
  carrier's capacity and each carried weapon's attack (`weaponAttack`).
- Rules: `weapons.ts` (SRD mechanics, project words), `weaponModifier` (finesse), `carryingCapacityLb`;
  the sheet's derived attacks include wielded weapons.
- Domain/combat/context: `wieldedWeapons`; attacks accept them; `weapon_attack` per weapon in a fight.
- Client: the inventory (purse and load, paper doll, bag, item card, drag and drop, taken-slot hint),
  weapon attacks in the turn tray and side panel with the item's picture; RU dictionary.
- DM history lists substitutions made at the table only (the seed's equipping of Elowen's bow is not
  the DM acting for her) — the same rule time and weather already had.
- Seed: Elowen's bow in hand, a short blade, a skinning knife, a purse; Mira's crowns, Orin's staff.
- Art: 17 GPT pictures (14 weapons, 3 coins) through the UI-kit pipeline; manifest only extended.

## Verification

- Unit 3499 (new: melee in hand with finesse, refusal without the weapon, out of reach; routes).
- Browser: `items.spec.ts` rewritten for the new inventory (purse 27 crowns, load against 150 lb, the
  doll's Body slot, wielding from the card after freeing the main hand, dragging the buckler onto the
  off hand, the sheet's attacks), RU, axe at three widths. Layout audit of the inventory at
  1440/768/390/320: no findings in it. Screens reviewed (desktop card, tablet, phones, the turn tray).
- Full browser suite: 208 passed, none failed (7.1 min, two workers).
- Lint, typecheck, Prettier and the context budget clean.

## ADR 0039 amendment (2026-11-01, owner-delegated)

Weapons and coins join the catalog. A weapon item names the rules weapon it fights as; a character
attacks with what it holds in a hand as well as what its sheet lists. Stacks stay at most 99 units.
