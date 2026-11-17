# Stage 730 completion — the next game

Work order `work-orders/STAGE_730.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 1); the owner's
answer «Дата + файл календаря» and word of 2026-11-15, «не спрашивай меня, а действуй по плану до
конца» (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR 0071 §3; 2026-11-15. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-730-next-game`, stacked on Stage 720's (PR 39,
not merged). Session model: Claude Fable 5.2.

## What changed

- **The date.** The DM sets when the table meets again — a day, an hour and an optional line of 120
  characters ("At Grandma's") — on the Session sheet, at any time; changes it; removes it. It is
  part of the table's state (migration 0041, two columns): table data beside the world, read by no
  World Engine decision.
- **Where everyone reads it.** A line in the lobby while no session is open, above the stars card;
  the campaign's card in the account's list; the join screen of the table's screens; the Session
  sheet. Each screen writes it in its own time zone and in the reader's flavour of the campaign's
  language (18:00 or 6:00 PM), with "today", "tomorrow" or "in 6 days" counted by the calendar's
  days and counted again at midnight; the DM's line stands under the date.
- **The calendar file.** "Add to calendar" gives one event of three hours — the campaign's name,
  the instant, the DM's line — with reminders a day and an hour before. A file saved after a change
  replaces the event a calendar already holds. Inside the campaign for every member, and from the
  account's list for its own campaigns. The reader's own calendar reminds them: the product still
  sends nothing itself.
- **When it stops.** A date is shown through its own evening (six hours from its hour); the session
  that starts within twelve hours of it clears it; a date for a later day stays.
- **Session's decisions** (the owner asked not to be asked; each may be overruled): the twelve-hour
  rule above instead of "any session's start clears it"; no end time is kept; one line beside the
  stars card instead of a copy on it; the file is sent inline so that a phone's browser may offer
  its own calendar; the link is not shown in the native apps (Stage 750) nor where sign-in is a
  typed token; the glyph is the kit's `day-counter`.

## Found and fixed on the way

- **The file's escape of a semicolon was wrong, and its unit test agreed with it.** A typo wrote the
  semicolon back unescaped and the test's expectation carried the same typo; the journey that reads
  the saved file caught it. Both are corrected; a second test now pins control characters too.
- **From the independent UX pass** (no blocker; seven points taken): the form was mounted anew
  after each write, so its confirmation was never seen and focus was lost; a date six to
  twenty-four hours past was accepted and then shown to nobody under "everyone sees it" (the two
  windows are now one, and the form says "That time has already passed"); removing the date wiped
  the fields (they stay, so a slip is one press to undo); a failed removal spoke of setting; the DM
  and the account's list had no way to the file; the label ran into the date ("Next game:" now);
  a long line buried the date (it has a line of its own).
- **From the layout audit**: the Russian "через 6 дн.." (the browser's own declension now: "через 6
  дней", "через 21 день"); the mark sat mid-way down a wrapped line; on a 320×640 phone the three
  lobby cards climbed under the top bar (a long line keeps two rows there).

## Files

Contracts `session/lobby.ts`, `session/accounts.ts`. Server `src/table/next-game.ts`,
`table-state.ts`, `postgres-table-state-store.ts`, `lobby-routes.ts`, `src/accounts/accounts.ts`,
`account-routes.ts`, `http/app.ts`, migration `0041_next_game.sql`. Client `ritual/next-game-words.ts`,
`next-game.tsx`, `dm/session-sheet.tsx`, `session/lobby-banner.tsx`, `session/hub.tsx`,
`display/cast-views.tsx`, `styles/stars.css`, `styles/ritual.css`, `i18n/ru-ritual.ts`. Journeys
`tests/e2e/next-game.spec.ts`, `next-game-file.spec.ts`.

## Verification

Run on the branch on 2026-11-15/16 (offline; no paid call):

| Check                                                         | Result                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                                                                                                           |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                                                                                                                                      |
| `pnpm run test` (unit)                                        | 572 files, 4608 tests pass                                                                                                                                                                                                                                     |
| `pnpm run build`                                              | pass, after a rename: the first build refused two client files of one output name (`next-game.ts` beside `next-game.tsx`), which the typecheck does not see; the words are now `next-game-words.ts`                                                            |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 79 files, 394 tests pass: PostgreSQL holds the date and its limits, migration 0041, the move's coverage                                                                                                                                                        |
| `pnpm run test:e2e` (the whole suite)                         | 340 pass, 3 fail, 1 did not run; of the three, one was this stage's (below, fixed and passing), one passed when run again, one is `voice.spec.ts:77` (below). The whole suite was not run again after these fixes and the rename: the journeys they touch were |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | no finding from this stage at 1440, 768, 390, 320 and 832×400 in both languages, in the account's list, nor on the TV at 960×540, 1920×1080 and 4K; three reviewed, below                                                                                      |

The stage's journeys: `next-game.spec.ts` (Chromium on a laptop, WebKit on an iPad: set, read,
change, remove and set again, an evening already over, the session that clears it) and
`next-game-file.spec.ts` (the saved file's text from the lobby and from the account's list, the
DM's own link, the TV's join screen).

The whole suite's three failures: `evening-ritual-screens.spec.ts:45` looked for "the" status of
the Session sheet, and the next game's form gave the sheet a second one — the journey now names the
sheet's own (the product was right); `evening-ritual.spec.ts:31` on the iPad read "Session 1" in
the start form's title once, late in the run, and passed when run again alone and with its file
(Stage 710's code, not touched here: a race worth a look of its own); `voice.spec.ts:77`, below.
After the fixes and the rename: format, lint, typecheck, context budget, the unit tests and the
build were run again whole; of the journeys — both ritual files, `stars-and-wishes`, and this
stage's two.

## Adversarial pass (invariants 1–5, 11)

- Who writes: a player's attempt to set the date is 403; a table display writes nothing (GET only).
- Who gets the file: a member 200, a table display 403, a stranger 404, a perspective in the query
  400 (it takes none); by the account — its own campaign 200, another campaign 404, no cookie 401.
- What the file holds: the campaign's name, the instant, the DM's line. The tests look for a
  character's and a place's name and the session's title and find none.
- The DM's line into a file: commas, semicolons, backslashes and new lines escaped, control
  characters removed, lines folded at 75 octets without splitting a character; a line that tries
  to close the event and add an attendee stays one description (`next-game.test.ts`).
- The world is untouched: no command, no event; the date is not in the World Engine's state.
- Looked for and left as designed: every member reads the DM's line — it is written for them; the
  UID names the server's host, which every member already knows.

## Not verified, and limits

- **No real phone.** Whether iOS Safari and Android Chrome open their own "add to calendar" screen
  for the inline file, and whether a second save replaces the first event in Apple's and Google's
  calendars, was not tried: only Chromium's download and the file's text were checked. The native
  apps do not show the link until Stage 750.
- `tests/e2e/voice.spec.ts:77` fails on this machine as in Stages 710 and 720 (WebRTC stays
  "connecting"); the stage touches nothing of voice. The pull request's CI decides.
- The audit's reviewed findings, none from this stage: `row-content-misaligned` on the Session
  sheet's Music panel (as in Stage 720); `content-too-wide` on the TV's join screen (a TV fills
  its screen on purpose); `label-clipped-by-box` for the scene's "In this scene" list on a wide,
  short screen (832×400) in a campaign signed in by invitation — the list, not the lobby's cards;
  a follow-up of its own.
- On a small phone with the stars card too, a line longer than two rows ends in "…" in the lobby;
  the whole of it is on the campaign's card in the list.
- A screen reader's actual speech was not heard; focus after a press was checked in Chromium
  (Safari gives a pressed button no focus to keep).
- `pnpm run db:migrate` was run only inside the integration tests' throwaway databases, never on
  the shared development database; nothing was run on a deployment or on a real TV. No human has
  played it.

## For the owner

- The twelve-hour rule and the inline file are the session's choices (above). Say so if any
  session's start should clear the date, or if the file should download instead.
- Play acceptance is the owner's: set next Saturday on the Session sheet, read it on a phone in
  the lobby and in the list of campaigns, press "Add to calendar" on a real iPhone.
