# Stage 810 completion — a short way to a pause

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/50 (draft, stacked on
Stage 800's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/49).

Work order `work-orders/STAGE_810.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 810); ADR 0073
§2; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch
`claude/stage-810-short-way-to-a-pause`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **One press.** While a game plays, a player's own screen has "Ask for a pause" over the stage.
  It used to take three presses through "How to play", and reached the DM as an unread mark in
  Chat.
- **The DM alone is told**: a card among the table's questions — "Elowen asks for a pause. Only
  you see this." — with "Pause the game" and "Not now". No sound, nothing in Chat, nothing on the
  table's screen or another player's. "Not now" tells the asker the DM has seen it.
- **Kept nowhere**: a request lives in the server's memory for ten minutes at most. No table, no
  migration.
- "Our table" in "How to play" keeps the same request, and still offers "Tell the DM privately".
- **Session's decisions**: all of ADR 0073 §2; they are listed in the work order.

## Found and fixed on the way

From the independent UX, copy and accessibility pass (a reviewing subagent, reading the source):

- **A DM on a phone with a sheet open never saw the card** — the table's questions give way to
  an open sheet there, and this one is told nowhere else. The card now stays over the sheet (a
  journey holds it).
- Focus was dropped when the player's button and the DM's card removed themselves; each leaves a
  line that takes it, and the DM's says what happened ("The game is paused. Resume it in
  Session.").
- A failed re-read made the line and the card vanish and come back; an old failure showed on a
  later card.
- Wording: the asker is told when they may ask again; two Russian lines that read alike; "this"
  and "your own screen" in the guide.

Not taken: the button over the scene is not given room of its own on a phone (it is small and is
there all evening).

## Verification

| Check                                                                                                                                                 | Result                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Format, typecheck, context budget                                                                                                                     | pass                                                                                                               |
| Lint                                                                                                                                                  | pass on the whole repository before the pass's fixes; on the changed files after them                              |
| Unit tests                                                                                                                                            | pass — 590 files, 4733 tests, before the pass's fixes; the dictionary, architecture and pause tests again after    |
| Integration tests (PostgreSQL 16)                                                                                                                     | pass — 82 files, 401 tests (the stage adds no table)                                                               |
| Build                                                                                                                                                 | pass                                                                                                               |
| Journeys, Chromium: `pause`, `pause-words`, and the neighbours `agreement`, `ritual-checkpoint`, `comforts`, `client-errors`, `client-errors-screens` | pass (11 journeys)                                                                                                 |
| Screens at 1440, 768, 390, 320 and 832×400, English and Russian                                                                                       | looked at, 70 screenshots: the button, the asker's lines, the DM's card with and without a sheet, the guide's page |
| Independent UX, copy and accessibility pass                                                                                                           | done from the source; findings above, fixed                                                                        |

**Adversarial pass against the boundary.** The one secret is who asked. The read answers the DM
with every request and a character's own view with its own only; another player's character, the
party's view, the public view and a table display are refused (unit tests per perspective). The
live stream of another player and of the display is not signalled when someone asks (tested: no
`changed`). The journey reads everything the other player's page and the TV were sent and finds
no request in it. The pause that follows names nobody. What is left is outside the application:
at a table of three a pause seconds after a press lets a child guess, and the DM's own screen
shows the card to whoever looks at it (ADR 0073, Consequences).

## Not verified

- **The whole browser suite was not run on this branch** in this environment (it takes about
  fifty minutes here and was run for Stage 800); the pull request's CI runs it on both engines.
- **WebKit / the `ipad` project**: not installed here; `pause.spec.ts` is in the `ipad` list and
  runs in CI.
- **A real phone, a real TV**; a screen reader's actual announcements.
- At 832×400 the button lies over the first hero's name on the scene (the name is also in the
  party's rail); seen in the screenshots, left as it is.

## For the owner

Merge after pull request 49 (Stage 800). No migration. Only the owner can: merge, deploy, and
see whether a child at the real table finds the button and trusts it.
