# Work Order — Stage 530: Rests, levels and the Missing Caravan's ending

Authority: owner request 2026-11-01, program `docs/PRODUCT_COMPLETION_PLAN.md` (decisions 9 and 10);
ADR 0040 and ADR 0025 amended below them.

## Deliver

1. **Rules** (`packages/rules/src/rest.ts`, SRD 5.2.1): Hit Point Dice per class level (Ranger d10,
   Wizard d6); spending one heals the roll plus Constitution, at least 1, up to the maximum, and is
   refused before any roll when none is left, at full hit points, or at 0; a long rest gives back all
   hit points, every spent Hit Point Die, slots and free casts, and clears death saves and
   Unconscious; a milestone level adds the class die's fixed hit points plus Constitution (at least
   1), the new spell slots and a Ranger's Extra Attack at 5. The sheet records spent dice
   (`hitDiceSpent`); the derived sheet lists them.
2. **Server** (`apps/server/src/rest/`): the DM opens a short rest (an hour passes) or takes a long one
   (eight hours pass, every party character's sheet restored), ends the short rest, grants a level;
   the character's player (or the DM) spends a Hit Point Die the server rolls, which joins the roll
   feed. No rest in a fight. Every sheet goes through the World Engine; retries are `duplicate`.
   Open rests in PostgreSQL (migration 0026); the live fingerprint covers them.
3. **Client**: the DM's Rest card in Time and weather; the short rest's banner over the world (the
   player goes from it to the sheet; the DM ends the rest); Hit Point Dice in the sheet's Overview
   with one Spend button per size; the DM's level control with a deliberate second press; the
   Journal's quests with their steps and status. RU/EN.
4. **The Missing Caravan ends** (`shown-to` milestone, `completion`): after the return, showing Mira
   Vale the party's evidence about the caravan completes the quest. The played Ravenford scenario
   (EN and RU) now reaches the ending.
5. Tests: rules, routes, the PostgreSQL store, the quest projection, the scenario, browser journeys
   with axe at three widths.

## Boundaries

No new kernel command or event; rests are table state beside the world (ADR 0040 amendment). No
new classes, features beyond hit points, slots and Extra Attack, or exhaustion.
