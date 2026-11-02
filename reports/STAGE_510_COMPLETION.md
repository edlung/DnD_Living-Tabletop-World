# Stage 510 completion — dice at the table

Work order `work-orders/STAGE_510.md`; ADR 0040; program `docs/PRODUCT_COMPLETION_PLAN.md`. 2026-11-01.

## What changed

- **Server** (`apps/server/src/dice/`): the roll feed reads the World Engine's dice back from events
  (attacks and damage with the weapon's or monster's die and Hunter's Mark's d6, spells' damage and
  healing, checks, saves, death saves, initiative) and merges the table's rolls, per perspective;
  free rolls, checks and saves rolled with `node:crypto` and the sheet's bonus; the DM's check
  requests with a hidden DC, answered once. Migration 0025 (append-only rolls, requests open → rolled
  or cancelled). The live fingerprint covers `rolls` and `check-requests`.
- **Client** (`apps/web/src/dice/`): 3D dice (three.js 0.186.1, cannon-es 0.20.0; lazy chunk) for d4,
  d6, d8, d10, d12, d20 and percentile — chamfered gold edges, GPT obsidian (players) and ivory (DM)
  surfaces, simulated first and relabelled by one swap to land on the server's value — in the top
  layer over any dialog, with a plate (sum, hit/miss, critical, success) placed beside the dice.
  Synthesized impact sound per bounce. Per-viewer sound, volume and motion settings. The Dice sheet
  (picker, modifier, check, the DM's ask and requests, the log), roll buttons in the character sheet
  (skills; ability checks and saves). The latest roll is announced in words once it has landed.
- Narrow phones: a player's six dock tabs share the bar; the DM's tablet dock keeps all eleven items.

## Verification

- Unit: 3496 tests (new: feed visibility, table rolls, requests, world rolls from a real ambush,
  solids, landing, percentile, audio). Integration: the PostgreSQL store (append-only, a raced answer
  counted once).
- Browser: `tests/e2e/dice.spec.ts` (free roll lands on the server's values and joins the log; a sheet
  roll over the dialog; the DM asks with a hidden DC and the player answers live; reduced motion; RU;
  axe at three widths). Full suite 207: all green after fixing the regressions it found (DOM order of
  the result, a second `status` region, the DM's tablet dock, the dock count).
- Layout audit of the Dice sheet at 1440/768/390/320 for player and DM: no findings in it.
- Screens of the dice in flight and at rest reviewed by eye.

## Adversarial notes

- A player cannot roll hidden, roll for another character, answer another's request or answer twice;
  a requested DC and its success never reach a player; world rolls carry no target or DC.
- Sound needs a gesture to start (browser policy); it stays silent until then, by design.
- Not verified by a human ear: the synthesized sound's character (owner's judgement at play).
