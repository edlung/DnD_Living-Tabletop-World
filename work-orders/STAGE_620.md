# Work Order — Stage 620: The DM's screen

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone A); ADR 0043 (amends ADR 0010, ADR 0015 §3–5, ADR 0034's shell,
ADR 0040).

## Deliver

1. **The DM's hand in the World Engine** (620a): damage, healing, a condition and Heroic Inspiration
   by hand with a reason, through the fight's own rules; a ruling as a party memory with a reason;
   the DM's history listing them with the kernel's undo; a check asked of several at once; notes.
2. **A running fight changed** (620b): a creature joins or leaves, a turn is delayed, initiative is
   set; fights of up to 40 combatants.
3. **The control screen** (620c): the Party sheet (the party at a glance with the DM's hand on each,
   a check for everyone, a ruling), the turn order in the Encounter sheet, the Notes sheet; a
   reload comes back to the open sheet.
4. **A session's lobby and lifecycle** (620d): start at the table or online, pause and resume (a
   player's command waits), absent players, the end with the screens unpaired and guests' seats
   freed, then the chapter; players' "ready" and the pause banner.
5. **iPad** (620e): the DM's screen journeys in WebKit on an iPad, locally and in CI.

## Boundaries

No new rules beyond the hand tools; no encounter builder (Stage 670); physical dice entered by hand
and their confirmation are Stage 630. Migration 0029 is additive.
