# Work Order — Stage 510: Dice at the table

Authority: owner request 2026-11-01 (`reviews/OWNER_PRODUCT_COMPLETION_2026-11-01.json`), program
`docs/PRODUCT_COMPLETION_PLAN.md` (decisions 1–4), ADR 0040.

## Deliver

1. **Roll feed** (`GET …/rolls`): the World Engine's dice read back from events (attacks and damage
   with the weapon's or monster's die, spells' damage and healing, checks, saves, death saves,
   initiative) plus the table's rolls, filtered per perspective: a player sees its own character's
   rolls and the table's public rolls by people it knows; the DM sees all; no target, DC or clue.
2. **Table rolls** (`POST …/rolls`, migration 0025): free dice (up to four kinds, ten each, a modifier;
   the DM may hide), checks and saves rolled with the canonical sheet's bonus (Advantage and
   Disadvantage), stored beside the world, append-only.
3. **The DM's check requests** (`…/check-requests`): ask a character for a skill, ability or save with
   a hidden DC; the player answers once (race-safe); the DM sees the total and success.
4. **3D dice** (three.js, cannon-es; lazy chunk): d4–d20 and percentile, chamfered gold edges, GPT
   obsidian (players) and ivory (the DM) surfaces, simulated first and relabelled to land on the
   server's values; they fly in the top layer over dialogs; a plate with the sum and result.
5. **Sound**: synthesized impacts per bounce (table and die-to-die), loudness from speed, panned;
   per-viewer sound, volume and motion settings; reduced motion keeps the plate and the sound.
6. **UI**: the Dice sheet (picker, modifier, check, the DM's ask and requests, the log, settings);
   roll buttons on the character sheet (skills, ability checks, saves); the latest roll announced in
   words; live updates (the feed and requests are covered by the live fingerprint).
7. Tests: server routes and visibility, world rolls from a real ambush, PostgreSQL store, solids,
   landing, audio; e2e journeys (free roll, sheet roll, DM ask and answer, reduced motion, RU, axe).

## Boundaries

No client randomness; no new kernel event; rolls never change world state; knowledge isolation holds.
