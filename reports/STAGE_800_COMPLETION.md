# Stage 800 completion — client error reports

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/PRNUM (draft, stacked on
the plan's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/48).

Work order `work-orders/STAGE_800.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 800); ADR 0073
§1; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-800-client-error-reports`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as that session
relayed it: «приступай к реализации этих улучшений. все что возможно сделай в облаке, доступ к
github у тебя есть.» (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`). This session did not see it
typed. Every design point below is the session's and stays the owner's to overrule.

## What changed

- **A broken page says so.** Every page — the game, the list of campaigns, signing in, the
  table's display, the workshop, the privacy notice — now shows "Something went wrong", that the
  game itself is safe, and "Load the game again", where it used to go blank (the game's own
  screen used to offer only a button that signed the person out). The table's display loads
  itself again, three times in ten minutes at most.
- **The page tells the family's own server**: how the error surfaced, its class from a fixed
  list, which screen and which part of it, the browser and the device's system, up to three
  places in the application's own scripts. Never the error's message, an address, a name, a
  login, a character or a typed word. `POST /client-errors`; nothing leaves the server.
- **The DM reads it.** A line among the table's questions — "Something broke on a player's
  screen" — with "What broke" and "Not now"; the list is at the top of the Session sheet, in
  plain words, with the technical line folded under "For whoever looks after the server", and
  "Clear the list". Reports from before sign-in are the operator's, in the database
  (`deploy/RUNBOOK.md` §9).
- **Kept thirty days**, a hundred a campaign (`ltw_client_errors`, migration 0044). The privacy
  notice says what a report holds, who reads it and for how long.
- **Session's decisions**: all of ADR 0073 §1; they are listed in the work order.

## Found and fixed on the way

- The game's own fallback was English in a Russian campaign (the journey caught it).
- From the independent UX, copy and accessibility pass: the DM's list was a card over the stage
  that covered the dock on a short wide screen — it lives on the Session sheet now; the broken
  screen claimed "a note was sent" before knowing one had left; buttons under 44 px; focus lost
  after "Clear the list"; the line over the stage could not be put away; the table's display did
  not say it would reload itself; the server's log copied a report's fields, which made "removed
  after thirty days" untrue.

## Verification

| Check | Result |
| --- | --- |
| Format, lint, typecheck, context budget | pass (after the rebase onto the moved Stage 799 branch) |
| Unit tests | pass — 588 files, 4715 tests (before the rebase; the rebase brought four CI files) |
| Integration tests (PostgreSQL 16) | pass — 82 files, 401 tests (before the rebase) |
| Build | pass |
| The stage's journeys, Chromium (`client-errors.spec.ts`, `client-errors-screens.spec.ts`) | pass |
| The whole browser suite, Chromium | 339 passed, 11 timed out at 30 s in the first run, while this session was also compiling another working copy on the same four cores; all 11 passed when run again — 7 together, the last 4 one at a time (`authoring-drafts:22`, `combat-lifecycle:17`, `combat-turn:18`, `dice:102`, `dm-history:66`, `light:21`, `live-undo-notice:20`, `live-world:23`, `party:46`, `rest:133`, `sign-in-tabs:37`) |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian | looked at, 34 screenshots: the broken page, the game's fallback, the DM's line, the list, the display |
| Independent UX, copy and accessibility pass (a reviewing subagent) | done; findings above, fixed |

**Adversarial pass against the boundary.** A report cannot carry a free word: every field is an
enumeration, a number or a script's file name, and anything else is refused (tested with extra
fields, a message, an address, a long body). A report naming a campaign its sender is not a
member of is kept under no campaign, so nobody writes into another table's list. A player and a
table display are refused the list (404/403) and the clearing; the live signal for a new report
goes to the DM and to no player. The route's answer says nothing of the world or of who sent it.
What is left: anyone at the table can put a made-up script file name before the DM (ADR 0073,
Consequences), bounded by the limits.

## Not verified

- **WebKit / the `ipad` project**: not installed in this environment. The stage's journey is in
  the `ipad` list and runs in the pull request's CI.
- **A real phone, a real TV, the native shells**: nothing was run on a device. The shell's name
  on a report comes from the bridge's own answer and was tested with a stand-in.
- **A real minified build's frames** in Safari and Firefox: the frame reader is tested against
  each engine's format from written samples, not from a live crash in those browsers.
- The unit and integration suites were not run again after the rebase (it changed
  `apps/web/dev-trace.ts`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`); typecheck
  and lint were.

## For the owner

Merge after pull request 48 (the plan), which follows 37–44, 46 and 47. Migration 0044 is
additive. Only the owner can: merge, deploy, and see a report arrive from a child's real phone.
