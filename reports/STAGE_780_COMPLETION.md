# Stage 780 completion — the home between worlds

Work order `work-orders/STAGE_780.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 2, decision 12);
the owner's word of 2026-11-16, «продолжаем», and the word of 2026-11-15 to follow the plan
without asking (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR 0072 §2; 2026-11-16. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-780-home-between-worlds`, stacked on Stage
770's (PR 43, not merged). Session model: Claude Fable 5.2.

**Read first.** The plan called this stage its largest unknown and wanted its design drafted
after a campaign had been played to its end, and Part 2 re-read against the family playtest.
Neither has happened. Everything here is the session's draft of what "the home between worlds"
is; ADR 0072 §2 marks every point as the session's.

## What changed

- **A campaign can be finished.** On the Session sheet, between sessions, "The adventure's end"
  has "Finish the campaign": what it means, optional last words to the table, a confirming
  button. Finished, the sheet says since when, has no start form and no next date, lists what the
  heroes keep, and has "Reopen the campaign". Table data (migration 0043): the world does not
  know a campaign is over.
- **Finished, it is read, not played.** The server refuses every change to a finished campaign —
  409 `FINISHED`, as an away campaign's are refused — but for a short list its end still takes:
  the end and the keepsakes, the last evening's stars, table talk, the table's screens, who may
  come in or must go. A route added later is refused until it is named in that list.
- **Each hero keeps one thing.** Everyone's lobby says "The adventure is finished", with the
  DM's words and the way into the book; a player is asked what their hero keeps and answers in
  one control — the things the hero carries and the chapters of the party's story — with a few
  words.
  The DM chooses for someone who said theirs aloud. The server names the keepsake (the thing as
  that hero knows it, the chapter's title) and keeps the name with it.
- **The book ends.** After the gallery: "What the heroes keep", the DM's closing words, "The end".
- **The home between worlds.** The account's list sets finished campaigns apart under
  "Adventures we finished": the days played, the heroes, the keepsakes, "The book" first and
  "Look inside" after it.
- A person's copy of their data holds what their heroes keep (a DM's: the last words); the
  notice names them. The two tables move with a campaign. The live signal covers the new read.
- **Session's decisions**: all of ADR 0072 §2 — the end is table data and reversible; what a
  finished campaign still takes; one keepsake a hero, a thing carried or a party chapter, named
  by the server; everyone reads them; keepsakes only once finished, kept through a reopening; no
  picture in the account's list; the controls of play stay on a finished campaign's screens and
  are refused, the lobby saying why.

## Found and fixed on the way

- **The heroes of a finished adventure were nobody** in the account's list where no player had
  taken a seat: the list named the characters who have a player. It names the characters the
  party knows, as the book's cover does. The list's journey caught it.
- **On the DM's sheet the keepsake form's buttons lay over its fields**, on a strip of
  parchment, and "Not now" was light on light: the form's styles were the lobby card's. The
  layout audit caught both; on the sheet the form now wears the sheet's inks and its buttons
  stand after its fields.
- **A Russian date ended in two full stops** («16 ноября 2026 г..»): the audit's finding.
- **From the independent UX, copy and accessibility pass** (one blocker, ten more points taken):
  on a small phone and a phone on its side the card's buttons were below a scroll nobody would
  find (the card is whole on a phone now, the table's column scrolls, and on a short wide screen
  the buttons stay in view); the stars card under "The adventure is finished" asked for "a wish
  for next time" and competed with it (after the last game it asks for "a wish for the next
  adventure" and its button is quiet); Russian «оставить на память» reads as "leave behind"
  («взять на память» throughout); a chapter was listed as if it were a thing ("keeps: Session 1:
  …" — now "keeps the chapter “…”"); focus was lost when finishing, reopening or keeping for
  someone unmounted the control pressed (it goes to the block's title or to "Who is it for?");
  one line switched between a status and an alert and vanished when empty, and nothing was
  announced after a keepsake was kept (two lines that stay; "Kept." and "Kept for {name}." are
  said); a hero with nothing to choose from met an empty control (the form says so); eleven
  wordings in both languages, among them "Now it is read, not played…", "Your last words to the
  table" («последние слова» read as morbid) and "The campaign is played again."; the DM's
  closing words were nobody's (they are captioned "The DM's closing words"); in the account's
  list the role's mark sat at the middle of a tall card, the card's name was a heading of its
  section's level, and "Open" beside "The book" did not say what a read-only world opens to
  ("Look inside"). Not taken: a counter for the two length limits, marks on heroes who have
  already chosen, a "Not now" inside the DM's disclosure (its summary folds it), and the doubled
  owner in a thing's name ("Brann Ironvale keeps: Brann Ironvale's Woodcutter's hatchet" — the
  names are the test world's own; a thing named "Woodcutter's hatchet" reads well).

- **Found by the whole browser suite, once it was run to its end** (in a cloud session, and by
  the pull request's CI on both engines): the block "The adventure's end" kept an empty
  `role="alert"` line on the Session sheet at all times — one of the reviewer's "two lines that
  stay". Four older journeys read "no alert on the Session sheet" as "nothing failed" and broke in
  five places (`dm-screen.spec.ts:166`, `evening-ritual.spec.ts:35`,
  `evening-ritual-screens.spec.ts:47`, `own-dice.spec.ts:17`; the first two on the iPad project
  too). The line of what failed is now there only while a finish or a reopening has failed, as
  the keepsake form's is; the polite line of what was done stays (commit 2dbed0b7). This is what
  the first version of this report named as the stage's main open risk.

## Files

Contracts `session/ending.ts`, `session/accounts.ts`, `knowledge/views.ts` (`FINISHED`). Server
`src/ending/` (`ending-routes.ts`, `guard.ts`, `ending-store.ts`, `postgres-ending-store.ts`),
migration `0043_campaign_endings.sql`, `http/app.ts`, `http/errors.ts`, `main.ts`,
`live/live-app.ts`, `live/inventory.ts`, `campaigns/move/tables.ts`, `accounts/accounts.ts`,
`account-routes.ts`, `privacy.ts`, `privacy-routes.ts`, `finished-campaigns.test.ts`. Client `ritual/ending.ts`,
`campaign-end.tsx`, `keepsake-card.tsx`, `keepsake-form.tsx`, `dm/session-sheet.tsx`,
`session/lobby-banner.tsx`, `session/hub.tsx`, `session/hub-campaigns.tsx`,
`session/privacy-notice.tsx`, `alerts/table-asks.tsx`, `world/world-overlays.tsx`,
`chronicle/keepsake/` (`use-book.ts`, `book-model.ts`, `keepsake-pages.tsx`),
`styles/ending.css`, `styles/keepsake.css`, `styles/print-book.css`, `i18n/ru-ending.ts`,
`i18n/ru-privacy.ts`. Journeys `tests/e2e/campaign-end.spec.ts`, `campaign-end-hub.spec.ts`.

## Verification

Run on the branch on 2026-11-16 (offline; no paid call):

| Check                                                         | Result                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                                                                                                                                                                    |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`). The first version of this report said "none from this stage" and was wrong: the stage had grown `accounts/accounts.test.ts` to 504 lines (the target is 500). Its finished-campaign check now has a file of its own (`finished-campaigns.test.ts`) |
| `pnpm run test` (unit)                                        | 577 files, 4636 tests pass                                                                                                                                                                                                                                                                                              |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 81 files, 398 tests pass: the store held to the in-memory semantics, migration 0043, the move's coverage                                                                                                                                                                                                                |
| `pnpm run build`                                              | pass                                                                                                                                                                                                                                                                                                                    |
| `pnpm run test:e2e` (the whole suite)                         | **run to its end on Chromium in a cloud session after the fix above**: 342 journeys, 335 pass in the whole run, 7 ran out of their 30 seconds on a four-core container and pass when run alone (below). The `ipad` and `webkit` projects were not run there (below)                                                     |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | the lobby's card in three states, the DM's block, the book's end at 1440, 768, 390, 320 and 832×400 in both languages, the account's list at four sizes: no finding from this stage after the fixes; one reviewed, below                                                                                                |

**The whole suite, 2026-11-16, in a cloud session** (a four-core container; Node 24, Playwright
1.63 with its Chromium; the journeys' servers hold their own in-memory stores):

- A first whole run on commit faa85c42 was stopped at 172 of 342 once it had shown the defect
  above (167 passed; two failed on the alert, three ran out of time). The pull request's CI on
  the same commit (run 43821032472, hosted runners, all three projects) ended with 347 passed, 7
  failed, 1 skipped, 2 not run: six of the seven are the alert — `dm-screen.spec.ts:166` and
  `evening-ritual.spec.ts:35` on Chromium and on the iPad, `evening-ritual-screens.spec.ts:47`,
  `own-dice.spec.ts:17` — and the seventh is `[ipad] agreement.spec.ts:27` (under "Not
  verified"). Static checks, unit tests, build and integration tests and the deployment check
  passed there.
- After the fix (commit 2dbed0b7) the sixteen journeys of the files that failed and of this
  stage (`dm-screen`, `evening-ritual`, `evening-ritual-screens`, `own-dice`, `campaign-end`,
  `campaign-end-hub`, `campaign-book`, `campaign-book-hub`, `stars-and-wishes`, `agreement`,
  `agreement-screens`) pass on Chromium.
- Then the whole Chromium project, 342 journeys, 40.9 minutes: **335 pass; 7 fail, each a
  journey that ran out of its 30 seconds** (30.0–35.2 s): `combat-lifecycle.spec.ts:17`,
  `light.spec.ts:21`, `live-stand-in.spec.ts:43`, `live-undo-notice.spec.ts:20`,
  `live-world.spec.ts:23`, `perspectives.spec.ts:13`, `sign-in-tabs.spec.ts:37`. Five of them ran
  while the session was also running another stage's unit tests on the same four cores — the
  session's mistake, not the product's. **Run again alone, all seven pass** (15–30 s each; three
  within a second or two of the limit on this machine). None is a file this stage touched.
- `voice.spec.ts:77` and `table-display.spec.ts:65`, which failed in whole runs on the owner's
  laptop, pass here in the whole run and in the pull request's CI.

Run and passing on their own, after the last change to the product: `campaign-end.spec.ts`
(Chromium on a laptop, WebKit on an iPad: the end waits for the evening to close; the DM
finishes with closing words; no start form and no next date; the player's card, the form, a
choice refused while nothing is chosen, a thing kept with a few words, focus and what is
announced; the DM chooses a chapter for Brann; the book's last page; reopening) and
`campaign-end-hub.spec.ts` (the finished campaign leaves the list of those being played for
"Adventures we finished"; its book says "The end"). Before the reviewer's fixes these ran
together with `campaign-book.spec.ts` and `stars-and-wishes.spec.ts`, all passing; after them
the two files of this stage were run again, the other two were not.

## Adversarial pass (invariants 1–5, 11)

- The world is untouched: finishing, reopening and keeping write two tables and nothing else; no
  command, no event. The guard refuses and never writes.
- Who finishes and reopens: the DM; a player 403; with an evening open 422; words too long or a
  body out of shape 400; a stranger finds nothing (404).
- Play in a finished campaign: a world command and "ready" are refused 409 `FINISHED` on the real
  application; reading is not; the last evening's star is still written; reopened, the same
  command is taken. Every route the list names exists (a stale name fails the test); a route
  nobody named is refused (`guard.test.ts`).
- Who chooses for whom: a player for another's hero 403; through the party's view 403; for an NPC
  403; a stranger 404; before the campaign is finished 422; a table display chooses nothing. The
  DM for anyone — but only a thing that hero carries: another hero's thing is 422.
- What may be kept: a thing nobody carries, a thing another carries, a chapter told from a
  character, a chapter that does not exist — each 422; a kind out of the list or a line too long 400.
- What a keepsake shows: its name is taken in its hero's own view, also when the DM chooses, so
  the DM's knowledge of a thing never reaches the table through it.
- The account's list: of a finished campaign, to a member, the days played, the heroes the party
  knows and the keepsakes the whole table reads; no picture, nothing of the DM's.
- A person's copy: a player's own heroes' keepsakes; never the DM's last words, which are in the
  DM's own copy.
- Looked for and left as designed: a keepsake is a deliberate share — choosing a thing tells the
  table its name as its hero knows it; the DM can choose or take away anyone's keepsake; the end
  is one press to undo, so nothing guards against finishing by mistake but the confirming button.

## Not verified, and limits

- **WebKit after the fix.** The cloud session could not install WebKit (its network refuses
  Playwright's download host), so the `ipad` and `webkit` projects were not run there; and it
  could not push (no write access to the repository), so the pull request's CI has not run on
  the fix. What is known of WebKit is the CI run on the commit before it: the two iPad failures
  on the alert, which the fix removes for the same reason as on Chromium — read in code, not
  run — and the one below. The CI of the pushed fix is to confirm.
- **`[ipad] agreement.spec.ts:27` failed once in that CI run**: the player's card "Before you
  play" did not appear within fifteen seconds of the DM saving the agreement. It passes on
  Chromium here (three times) and passed on the iPad in Stage 770's CI. Whether it is a hosted
  runner's slowness or something of this stage on WebKit is not known; nothing of the agreement
  was changed here, but the lobby banner that holds its card was. To be watched in the next CI
  run.
- **Seven journeys ran out of time in the whole run and pass alone** (above): on this machine
  the suite's 30 seconds leave three of them a second or two to spare. That it is the machine
  and not a slow path this stage added was not proved beyond their passing alone.
- **Stage 770's CI (PR 43) is red** on `next-game.spec.ts:60`, on both engines (after the session started, the Session sheet did not say "No date yet." within fifteen seconds); the same journey passes in
  this stage's CI an hour later and in both runs here. Not investigated — neither stage changed
  the journey or the next game — and named so that it is not taken for green.
- **No human has used it**, and the design was not drafted from a campaign played to its end
  (see the top). Whether a table wants a campaign to refuse play once finished, whether one
  keepsake is right, whether children choose on phones or together at the table — unknown.
- **The controls of play stay** on a finished campaign's screens and fail when pressed with the
  application's ordinary "could not be reached" words; only the lobby's card and the Session
  sheet say why. An away campaign behaves the same; neither was made gentler here.
- **A finished campaign's Session sheet still offers** the table's dice, sound and music, the
  agreement and the campaign's options: each is refused by the guard when changed.
- **No picture in the account's list**, by decision; the book has them.
- The audit's reviewed finding: `row-content-misaligned` for a hero's one-line name among
  two-line names on the book's cover (centred, as meant; Stage 770's).
- Not tried: a real phone, a screen reader's actual speech, the native apps, a table display
  while a campaign is finished (it reads the end; nothing is cast for it).
- `voice.spec.ts:77` and `table-display.spec.ts:65` are as Stage 770's report describes them on
  the owner's laptop; both pass in the cloud session's whole run and in CI.
- Migration 0043 ran only in the integration tests' throwaway databases; nothing was deployed;
  the shared development database was not touched.

## For the owner

- This stage is the least grounded of the package: say what "finished" should mean at your table
  — whether a finished campaign should refuse play at all, whether one keepsake is right, whether
  the keepsake should be chosen at the table together rather than each on a phone.
- Play acceptance is the owner's: end the last evening, finish the campaign, choose keepsakes on
  the phones and for the youngest, open the book to its last page, find the adventure in the
  list of campaigns, reopen it.
