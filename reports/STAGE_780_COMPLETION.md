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

## Files

Contracts `session/ending.ts`, `session/accounts.ts`, `knowledge/views.ts` (`FINISHED`). Server
`src/ending/` (`ending-routes.ts`, `guard.ts`, `ending-store.ts`, `postgres-ending-store.ts`),
migration `0043_campaign_endings.sql`, `http/app.ts`, `http/errors.ts`, `main.ts`,
`live/live-app.ts`, `live/inventory.ts`, `campaigns/move/tables.ts`, `accounts/accounts.ts`,
`account-routes.ts`, `privacy.ts`, `privacy-routes.ts`. Client `ritual/ending.ts`,
`campaign-end.tsx`, `keepsake-card.tsx`, `keepsake-form.tsx`, `dm/session-sheet.tsx`,
`session/lobby-banner.tsx`, `session/hub.tsx`, `session/hub-campaigns.tsx`,
`session/privacy-notice.tsx`, `alerts/table-asks.tsx`, `world/world-overlays.tsx`,
`chronicle/keepsake/` (`use-book.ts`, `book-model.ts`, `keepsake-pages.tsx`),
`styles/ending.css`, `styles/keepsake.css`, `styles/print-book.css`, `i18n/ru-ending.ts`,
`i18n/ru-privacy.ts`. Journeys `tests/e2e/campaign-end.spec.ts`, `campaign-end-hub.spec.ts`.

## Verification

Run on the branch on 2026-11-16 (offline; no paid call):

| Check                                                         | Result                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                                                                     |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                                                                                                |
| `pnpm run test` (unit)                                        | 577 files, 4636 tests pass                                                                                                                                                                                               |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 81 files, 398 tests pass: the store held to the in-memory semantics, migration 0043, the move's coverage                                                                                                                 |
| `pnpm run build`                                              | pass                                                                                                                                                                                                                     |
| `pnpm run test:e2e` (the whole suite)                         | **not run to its end**: the run was stopped part-way when the owner had to close the laptop and the work moved to a cloud session. The stage's own journeys and their neighbours were run and pass (below)               |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | the lobby's card in three states, the DM's block, the book's end at 1440, 768, 390, 320 and 832×400 in both languages, the account's list at four sizes: no finding from this stage after the fixes; one reviewed, below |

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

- **The whole browser suite was not run to its end on this stage** (above). What changed
  outside the stage's own screens — the stars card's words after the last game, the lobby
  banner, the Session sheet, the account's list split into two lists — is covered by journeys
  that were not all run again after the last fixes. The cloud session that continues this work,
  or the pull request's CI, is to run it; until then this is the stage's main open risk.
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
- `voice.spec.ts:77` and `table-display.spec.ts:65` are as Stage 770's report describes them.
- Migration 0043 ran only in the integration tests' throwaway databases; nothing was deployed;
  the shared development database was not touched.

## For the owner

- This stage is the least grounded of the package: say what "finished" should mean at your table
  — whether a finished campaign should refuse play at all, whether one keepsake is right, whether
  the keepsake should be chosen at the table together rather than each on a phone.
- Play acceptance is the owner's: end the last evening, finish the campaign, choose keepsakes on
  the phones and for the youngest, open the book to its last page, find the adventure in the
  list of campaigns, reopen it.
