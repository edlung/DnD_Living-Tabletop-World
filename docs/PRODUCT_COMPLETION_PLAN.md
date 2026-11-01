# Product completion program (Stages 500–540)

Owner request 2026-11-01 (`reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`): finish the product so it
is playable from A to Z — items, characteristics, a worked-out beautiful inventory, beautiful character
cards, dice that roll across the interface with their own sound — and interrupt the owner as little as
possible. The owner delegated the product decisions of this program; they are listed below.

## Starting point (2026-11-01, main cf56d94)

- Play works end to end for the Ravenford slice and AI campaigns: sign-in, exploration, NPC talk,
  investigation, contradictions, combat with reactions, items (Stages 460–490), Chronicle, quests.
- The player never sees a real character sheet: "Full character sheet" is a plain list in the details
  panel (HP, AC, speed, classes); abilities, saves, skills, spells and slots are not shown.
- Rolls happen on the server and reach the client only as numbers in a sentence; no dice are drawn.
- The rules know 6 skills, 1 weapon (longbow), no rests, no hit dice, no coins, no levelling; the Missing
  Caravan quest has no ending.

## Stages

| Stage | Scope                                                                                                                                                                                                                         | Work order                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 500   | Character sheet and character cards: derived numbers from the server (`@ltw/rules`), all 18 skills, the hero sheet (overview, skills, spells), card component for the party rail, the DM and details                          | `work-orders/STAGE_500.md` |
| 510   | Dice: outcomes carry their dice; 3D dice with physics land on the server's results; procedural sound synced to the bounces; settings; the table's roll log with free rolls, checks from the sheet and the DM's check requests | `work-orders/STAGE_510.md` |
| 520   | Inventory 2.0: paper doll, bag grid with art, item card, purse, load; weapons in the catalog and attacks with the equipped weapon; coins                                                                                      | `work-orders/STAGE_520.md` |
| 530   | Rest and progression: short and long rests, hit dice, milestone level-up; the Missing Caravan's ending; gaps found in the walkthrough                                                                                         | `work-orders/STAGE_530.md` |
| 540   | A-to-Z verification: the full journey in the browser, layout and accessibility audits, UX passes, report, release to the VPS                                                                                                  | `work-orders/STAGE_540.md` |

Each stage: design notes in its work order, implementation, unit/integration/e2e tests, axe and the
layout audit at 1440/768/390/320, own adversarial pass, completion report in `reports/`. All stages
land on one branch and pull request so the owner is asked once, at the end, to merge and deploy.

## Decisions (owner-delegated, 2026-11-01)

1. **Dice are the server's.** Every die shown is a die the World Engine (or the table-roll service)
   rolled; the client only animates it to land on that value. No client-side randomness decides
   anything.
2. **3D dice with physics**: three.js and cannon-es (MIT), loaded on demand; d4, d6, d8, d10, d12, d20,
   percentile. The simulation runs first, the die's labels are permuted by a symmetry of the solid so
   the face the simulation leaves on top shows the server's value.
3. **Sound is synthesized** (Web Audio, no recorded samples): every bounce and dice-to-dice knock the
   simulation reports plays an impact scaled by its speed. Sound and animation are per-viewer settings
   (on by default; animation off under `prefers-reduced-motion`).
4. **Table rolls** (free rolls, checks and saves rolled from the sheet, the DM's requests) are not world
   history: they live in a table log (own migration), are rolled by the server, and are visible to the
   whole table; the DM may roll hidden. A requested check's DC is the DM's only.
5. **Character sheet**: progressive disclosure keeps the scene first; the hero sheet is one click away
   and shows the complete canonical sheet with derived numbers computed by `@ltw/rules` on the server.
   Another player's character shows only its card (name, portrait, class line, and hit points where the
   encounter already shows them).
6. **All 18 SRD skills**: the sheet may be proficient in any; existing sheets stay valid.
7. **Inventory**: paper doll with the existing slots, bag grid, item card with art, drag and drop with
   keyboard and button alternatives; load is shown (Strength × 15 lb), not enforced; coins are catalog
   stackables (gold, silver, copper).
8. **Weapons** join the item catalog with SRD weapon mechanics under Ravenford names; a character attacks
   with what it wields (sheet weapons keep working). Not modelled: weapon mastery, two-weapon fighting,
   ammunition counting.
9. **Rests** are the DM's call: a short rest lets players spend hit dice (rolled), a long rest restores
   hit points, slots, free casts and half the hit dice. **Levels** are milestones the DM grants.
10. **The Missing Caravan ends**: after the return, telling the guild what the party learned completes
    the quest.
11. **Out of scope**: new classes or species, character creation (parties are prepared by the DM or the
    workshop), shops and prices, crafting, chat.

## Release note

Fixture changes (items, quests) make the deployed review campaign's seed refuse a rerun; the release
backs up the VPS database, resets the review campaign and issues a new DM link (runbook section 12).
