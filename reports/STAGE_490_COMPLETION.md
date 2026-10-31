# Stage 490 completion — items in combat, part of a stack, NPC gear, Gate 07 Lows

Branch `claude/stage-490-items-in-combat` (on `claude/stage-470-campaign-items`). ADR 0039 amended.

## Delivered

- **Items in a fight.** A combatant handles items on its own turn only (`ILLEGAL_ACTION` with `NOT_YOUR_TURN`, `NO_ACTION`,
  `NO_BONUS_ACTION`). Cost: a potion or a worn-gear change is a Bonus Action; a shield or a mundane use an Action; handing
  over a Bonus Action to a combatant on an adjacent square; dropping is free; body armor and picking up wait for the end of the
  fight. The turn is spent by an ordinary `CombatantUpdated` beside the item event, so undo restores item, sheet and turn
  together. The Items sheet explains the costs and enables actions only on the character's turn.
- **Part of a stack.** `GiveItem` and `DropItem` take an optional `quantity`; a part becomes an item of its own (engine-drawn
  ID, `EntityCreated` + `ItemSplit` + `ItemTransferred`); undo puts every unit back; totals are conserved under concurrent
  divisions. The sheet has a "how many" choice.
- **NPC gear.** Orin (herb satchel, six balms) and Mira (guild signet, ledger) carry starting items in both Ravenford seeds.
- **Gate 07 Lows (review on PR 16):** G07-06 starting knowledge no longer completes quest milestones (regression test fails
  without the fix); G07-07 secret-like records in PUBLIC/PARTY scope give an acknowledgeable warning; G07-08 the NPC dialogue
  context is JSON-quoted with the "quoted game data" system line; G07-09 PNG/JPEG/WebP signatures are checked before any
  decoder runs; G07-10 bilingual runbook section 7b (invite/revoke owner, grants, FINITE stop).
  G07-05 (revocation reaching activated campaigns) stays the owner's call and is documented in the runbook.

## Verification (this machine, 2026-10-31)

typecheck, lint, format, context budget clean; unit 3,466; integration 350; browser 194 of 194 (system Chrome, temporary
uncommitted config). Not run: hosted CI, a human playtest, a live generation that returns `possessions`, item pictures
(blocked until 2026-11-04), a Gate 07 retest (the owner's call).

## Open

- Consent of the receiver when a player gives to another player's character (a product decision; none implemented).
- Armor and picking up stay impossible during a fight; weight is still not enforced.

## Live run (owner-authorized, 2026-10-31)

Two real seven-step generations on `claude-sonnet-5-5` with a brief asking for starting items (`work-orders/STAGE_490_LIVE.md`,
evidence `reports/evidence/stage-490-live-2026-10-31/`). Run 1 failed at the cast step ($0.213, 4 settled): the validator demanded a
placement for every active item, but carried items have none; fixed with a regression test and a prompt exception. Run 2: SUCCEEDED,
READY, 0 findings, 11 `possessions` rows with real catalog IDs, $0.413046, 8 settled, 0 holds, 136.6 s. Compiler result only: no
human review, no activation, no pictures.
