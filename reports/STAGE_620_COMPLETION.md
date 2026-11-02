# Stage 620 completion — the DM's screen

Work order `work-orders/STAGE_620.md`; program `docs/FULL_GAME_PLAN.md` (Milestone A), owner approval
`reviews/OWNER_FULL_GAME_2026-11-02.json`; ADR 0043; 2026-11-02.

## What changed

- **The DM's hand, through the World Engine.** Damage of a type, healing, a condition and Heroic
  Inspiration by hand, each with a reason (`AdjustHitPoints`, `SetCondition`, `SetInspiration`).
  Damage and healing run the fight's own rules in or out of a fight: a character falls unconscious
  and prone at 0 with death saves, a creature dies, a Concentration save follows damage, healing
  wakes. The record is the DM's (`HitPointsAdjusted`), never a creature's attack. Each decision
  reads the target, so undoing an earlier change under a later one is refused as unsafe — the DM
  history names the later step to undo first. A ruling is a party memory with the DM's reason.
- **A running fight changed.** Someone at the place joins (initiative rolled or named), someone
  leaves (with a reason; the turn passes on; their slowing ends), the current combatant delays
  until after another this round, initiative is set; one `CombatOrderChanged` per change. Fights
  hold up to 40 combatants.
- **The DM's history** lists every change by hand and every fight change with its reason and the
  kernel's undo.
- **The control screen.** The Party sheet: each character's hit points (bar and numbers), Armor
  Class, conditions, Heroic Inspiration, passive Perception, Insight and Investigation, spell slots
  and death saves, with the DM's hand on each in a short form that asks for a reason; a check asked
  of everyone at the table at once (one request each, one group); a ruling for the party. It takes
  most of the height on a laptop or an iPad. The Encounter sheet's turn order: initiative, delay,
  out of the fight, someone joining. The Notes sheet. A reload, or an iPad that slept, comes back
  to the open sheet.
- **A session.** The Session sheet starts a session (at the table or online), pauses and resumes
  the game — a player's command waits with "The DM paused the game" while the DM's go on — marks
  absent players, and ends the session with the table's screens unpaired and the seats of players
  without a login freed, then offers the chapter. Players say "ready" for the session to come and
  see the pause as it happens.
- **iPad.** The DM's screen journeys run in WebKit on an iPad (Playwright's `ipad` project),
  locally and in CI.
- Found on the way: the sheet view's field whitelist left out Heroic Inspiration; the DM routes'
  shared check refused a route's own path parameter (a note's ID); the lobby's writes needed the
  perspective the routes' order asks for.

## Verification

- Unit 3565 passed (new: `combat/hand.test.ts` — damage and healing through the rules, the
  dying pipeline, refusals, undo safety; `combat/order.test.ts` — delay, initiative, out and in;
  the DM history's hand and fight entries; the notes routes; group check requests; the lobby and
  the pause over HTTP).
- Integration: the notes, the table's state and the check request groups on PostgreSQL (migration
  0029); the DM history on PostgreSQL with the note store.
- Browser: `dm-screen.spec.ts`, 4 journeys in Chromium and in WebKit on an iPad — the Party sheet
  (damage with its reason asked first, a condition, inspiration, a check for everyone, a ruling,
  the history's words), notes and a reload, the turn order (delay, out of the fight), a session's
  pause seen by the player, its end, a player ready, the next session; axe on each sheet.
- Layout audit (temporary journeys, not kept) at 1440, 1180×820, 820×1180, 390 and 320 px of the
  Party sheet (forms with their errors), the Notes sheet, the turn order, the Session sheet and the
  player's lobby banner: fixed from it — words for screen readers escaping the sheet's scroll pane,
  fields stretched on an iPad in portrait, the Party sheet too short for a control screen, the
  phone's banner under the two-row top bar. Remaining: none.
- Lint, typecheck, Prettier and the context budget clean.
- Found by the full browser suite after the journeys (Stage 620f): with invitations the DM's dock
  held fifteen items and ran off the screen at 1280 px (English and Russian) and from 834 px
  down, and two tools shared another's glyph. Measured at 13 widths, then fixed by the dock's fit
  (full words, short words, More; ADR 0043 §3): `dock-fit.spec.ts` checks 1440 to 320 px with
  the fifteen tools in English and Russian and a player's phone, with no sideways scroll, nothing
  over the dock, More opening and closing with Escape, and focus back on More after a sheet
  opened from it closes; the Stage 360 and sign-in tablet checks count the tools wherever they
  are. Layout audit of the dock and More at 1440, 1280, 1180, 1024, 820, 768, 390 and 320 px:
  no findings beyond the known off-scale information items.

## Adversarial notes

- Every change of the world is the World Engine's, as the DM: a player cannot issue the hand or
  fight commands (403), and their reasons stay in the DM's history.
- A pause holds only players' commands at the commands route; it changes no canonical state and
  an older build ignores it (it would not hold commands).
- The lobby lists only the characters the perspective's own entity view lists, as presence does.
- Not done here: rewards at a session's end beyond the existing controls; physical dice entered
  by hand (Stage 630); all 15 conditions (Stage 640).
