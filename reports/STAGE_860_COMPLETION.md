# Stage 860 completion — a shorter way in for a guest

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/56 (draft, stacked on
Stage 850's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/55).

Work order `work-orders/STAGE_860.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 860); ADR 0073
§7; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-860-guest-way-in`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **One press sits a guest down.** A person who scans the table's code (or types it) sees the
  free heroes; pressing one sits them down in that browser at once. Before, the press led to a
  second page that asked for a login and a password, or for "Only this browser".
- **A login is still there for who wants one**: "I have a login or want one — to come back from
  any device", asked before the heroes; ticked, the press leads to the usual join page.
- **The way back**: "Already sat down on this device? Open the table".
- **On a phone the heroes stand at the top**: the page's own story ("Every place has a story…")
  is put away there, and still read aloud.
- The table's screen says "Scan with your phone and choose your hero."
- **No server change**: the link, its seats, its limits, its closing and the DM's list of seats
  taken are ADR 0042's, unchanged. No table, no migration.
- **Session's decisions**: all of ADR 0073 §7; they are listed in the work order.

## Found and fixed on the way

- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source): "I want a login" hid the choice "I have a login" from a parent with an account; the
  page did not say how a device that sat down comes back; the hint was tied to a list (not
  announced) and changed silently — the choice stands before the heroes and its line is a
  status; "character" where the table's screen says "hero".
- **By looking at the screens**: on a phone the heroes were a screen and a half down, under the
  picture and the page's story.
- The journey asserted that no "Login" was anywhere on the guest's game screen; the game has a
  field of that name for saving a seat. The assertion was wrong and is gone: the world showing
  after one press is the proof.

Not taken: a connection lost at the moment of the press ends on the invitation's own failure
page ("This invitation cannot be used…"), as it did when the seat went through the join page.
The sign-in flow is not changed by this stage.

## Verification

| Check                                                                                                                                 | Result                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                                                     | pass                                                                                                                                                                  |
| Lint                                                                                                                                  | pass on the files changed since Stage 850; the whole repository is linted by CI                                                                                       |
| Unit tests                                                                                                                            | pass for the web client, the dictionaries and the architecture rules (99 files, 641 tests); the server's suites were not run again — the stage changes no server code |
| Integration tests                                                                                                                     | not run: no server or database change                                                                                                                                 |
| Journeys, Chromium: `table-display`, and the neighbours `sign-in` (six), `sign-in-tabs`, `sign-in-accessibility` (four), `sign-in-ru` | pass                                                                                                                                                                  |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                                                       | looked at, 20 screenshots: the heroes, and the heroes with a login asked for                                                                                          |
| Independent UX, copy and accessibility pass                                                                                           | done from the source; findings above, fixed                                                                                                                           |

**Adversarial pass against the boundary.** Nothing a guest reads changed: the page lists the
free seats' names, as it did, and the seat's sign-in is the one "Only this browser" always
gave — a character's own view. What changed is how fast a stranger who sees the table's code
sits down: one page sooner. The guards are the ones ADR 0042 §5–6 set and this stage leaves
alone — the link's hours, the DM closing it, the limits on tries, and the DM's list of seats
taken, where a seat nobody at the table took is seen and its player removed. A guest who clears
the browser has no way back to that seat but a new link (ADR 0073, Consequences).

## Not verified

- **The whole browser, unit and integration suites were not run on this branch** in this
  environment; the pull request's CI runs them.
- **WebKit**: not installed here; `table-display.spec.ts` is not in the `ipad` list.
- **A real phone's camera on a real television's QR code**, and a grandmother.
- How long a seat taken this way lasts was not measured here: it is the session's own length,
  unchanged.

## For the owner

Merge after pull request 55 (Stage 850). No migration. Only the owner can: merge, deploy, and
hand a phone to a guest.
