# Stage 740 completion — the table's agreement and the DM's guide

Work order `work-orders/STAGE_740.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 1); the owner's
answer that the agreement and the DM's guide join the package, and the word of 2026-11-15, «не
спрашивай меня, а действуй по плану до конца» (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); ADR
0071 §4; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-740-agreement`,
stacked on Stage 730's (PR 40, not merged). Session model: Claude Fable 5.2.

## What changed

- **The table's agreement.** One short page a campaign, the DM's to write on the Session sheet:
  the tone (cosy, adventurous, spooky, grim, and a line of the DM's own), what is not in this game
  (eight things to tick and lines of the table's own), the table's sign for a pause, who plays.
  The form starts from what suits a family table, so keeping it is one press. Table data beside
  the world (migration 0042): no World Engine decision and no AI prompt reads it.
- **"Understood".** A player who has not said it to the page as it stands has a card — in the
  lobby and over a game in play — reads the page in a dialog and presses "Understood"; "Later"
  puts the card away until the screen is opened again. Changed words ask everyone again; the same
  words do not. The DM sees who has said it and presses "Said it aloud" for a child without a
  screen. Nobody else is sent that list.
- **The quiet ways to the DM.** "How to play" now ends with "Our table": the agreement, and for a
  player "Ask for a pause" — fixed words to the DM alone, once a minute at most — and "Tell the DM
  privately", which opens the chat with the DM chosen.
- **On the table's screen.** An `agreement` cast for the first meeting, to read aloud.
- **The DM's guide.** "How to play" opens for the DM on seven pages of "how to run the game" —
  before the evening, the first meeting, opening, during the game, the table's screen, closing,
  when something goes wrong — with the players' pages one press away.
- **Before the first evening.** Until a first session has ended, the Session sheet lists what to
  do first, ticked where the application can tell, with the way to the guide.
- **Session's decisions** (the owner asked not to be asked; each may be overruled): the four tones
  and eight ticks and the family start; the card shows over a game in play too (a campaign from a
  ready adventure begins with its first session open, so "between sessions only" would hide it
  before the first evening); "Ask for a pause" does not pause the game by itself; a library
  campaign's `audience` and `tone` do not start the page off; the marks of "Understood" are not in
  a person's copy of their data.

## Found and fixed on the way

- **"Understood" could not be pressed** once the reading dialog was moved beside its card: it
  inherited the lobby slot's "let presses through". The layout audit's journey caught it before
  the stage's own journey was run again.
- **The guide's dialog had no ground of its own**: over the lobby's light cards its text stood on
  whatever lay behind the glass. It has a solid ground now (all guide dialogs).
- **From the independent UX and copy pass** (no blocker; ten points taken): a second press of "Ask
  for a pause" sent a second request, and nothing said the request is private; on a short screen
  "Understood" and the guide's buttons were out of reach (the page scrolls inside the dialog now);
  six Russian wordings (among them «Сказать мастеру лично», which reads as "in person", and
  «Ругань», which reads as "quarrelling"); the card told a newcomer to read "again"; words typed
  while a save was on its way could be lost, and the form's "Saved" was hidden by its own folding;
  an unchanged save claimed everyone was asked again; a failed "Said it aloud" was silent; the
  guide's two parts promised tabs they were not; on the TV a long list would have run off a screen
  that does not scroll (two columns above six), and nothing said what to do after reading.

- **The journeys of Stages 710–740 left their pages open.** A page left open keeps its live
  stream, and the test server goes on reading every view for it each second; by the end of the
  iPad project the last journey took two to three minutes instead of nine seconds, and timed out
  in the first whole run of this stage. `tests/e2e/support/pages.ts` now closes a journey's pages
  with it (the iPad project: 43 seconds instead of 2.9 minutes; the whole suite 19.5 minutes
  instead of 22.8). The one-off failure of `evening-ritual.spec.ts:31` in Stage 730's run fits the
  same cause; that was not proved.
- **The build refused two files of one output name again** (`agreement.ts` beside
  `agreement.tsx`), as in Stage 730: the typecheck does not see it, the build does. The words are
  `agreement-words.ts` now.
- **The guide's own journey** counted five pages; it has six and reads the last.

## Files

Contracts `session/agreement.ts`, `display/display.ts`. Server `src/agreement/`
(`agreement-routes.ts`, `agreement-store.ts`, `postgres-agreement-store.ts`), migration
`0042_table_agreement.sql`, `http/app.ts`, `main.ts`, `live/inventory.ts`, `live/live-app.ts`,
`campaigns/move/tables.ts`. Client `ritual/agreement-words.ts`, `agreement.tsx`, `agreement-tool.tsx`,
`guide/guide.tsx`, `dm-guide.ts`, `our-table.tsx`, `dm/first-evening.tsx`, `shell/requests.ts`,
`dm/session-sheet.tsx`, `session/lobby-banner.tsx`, `session/app.tsx`, `shell/top-bar.tsx`,
`chat/chat-sheet.tsx`, `dm/cast-form.tsx`, `display/cast-views.tsx`, `online/shared-screen.tsx`,
`styles/agreement.css`, `styles/guide.css`, `i18n/ru-agreement.ts`. Journeys
`tests/e2e/agreement.spec.ts`, `agreement-screens.spec.ts`.

## Verification

Run on the branch on 2026-11-16 (offline; no paid call):

| Check                                                         | Result                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                                                                                               |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                                                                                                                          |
| `pnpm run test` (unit)                                        | 574 files, 4616 tests pass                                                                                                                                                                                                                         |
| `pnpm run build`                                              | pass, after a rename (below)                                                                                                                                                                                                                       |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 80 files, 396 tests pass: the store held to the in-memory semantics, migration 0042, the move's coverage                                                                                                                                           |
| `pnpm run test:e2e` (the whole suite)                         | 347 pass, 2 fail, with Stage 760's journey also in the tree: `scene-result-layout.spec.ts:91` (passed when run again with its file: a measurement taken a moment early under the full run's load; not touched here) and `voice.spec.ts:77` (below) |
| `ui-layout-audit` (`audit.mjs` in a temporary journey)        | no finding from this stage at 1440, 768, 390, 320 and 832×400 in both languages, nor on the TV at 960×540, 1920×1080 and 4K; reviewed ones below                                                                                                   |

The stage's journeys: `agreement.spec.ts` (Chromium on a laptop, WebKit on an iPad: the DM writes
the page; a player puts the card away, reads, agrees; the DM says it for another; changed words
ask again; "Our table", a pause asked once, the chat opened to the DM; the guide by role; what the
player's browser was sent) and `agreement-screens.spec.ts` (the TV reads the page and follows a
change, and is sent no list; a campaign started anew and its first-evening list).

The first whole run of this stage had four failures: the guide's two journeys (the sixth page,
above), `stars-and-wishes.spec.ts:29` on the iPad (the pages left open, above) and
`voice.spec.ts:77`. The run reported in the table was made after those fixes. After it one line
changed (the key of a repeated line in the page's list): format, lint, typecheck, the build and
this stage's journeys were run again, the whole suite was not.

## Adversarial pass (invariants 1–5, 11)

- Who writes the page: a player, in their own view or the party's, 403; a table display writes
  nothing; a page out of shape (an unknown tone or tick, a tick twice, too long a line, an extra
  field) 400 and nothing kept.
- Who says "Understood": a player for another character 403, through the party's view 403; for an
  NPC 422; to a version not shown — older or not yet written — 422; the DM for any character.
- Who reads who has said it: the DM. A player's view, the party's view and a table display are
  sent `readers: null`; the journeys look through everything the player's browser and the TV
  received for a list and find none.
- A stranger finds nothing (404); a table display may not take the DM's view (403).
- The pause's request is a whisper to the DM: the chat's own boundary (ADR 0044 §1), unchanged and
  already tested; it writes nothing to the world and pauses nothing.
- The world is untouched: no command, no event; the guide's pages are static words.
- Looked for and left as designed: the DM can say "Understood" for anyone — a child without a
  screen is the reason — and the list shows it as said, not by whom it was pressed.

## Not verified, and limits

- `tests/e2e/voice.spec.ts:77` fails on this machine as in the stages before (WebRTC stays
  "connecting"); the stage touches nothing of voice. The pull request's CI decides.
- **A pause mid-game is three presses deep** for a player ("How to play", "Our table", "Ask for a
  pause"), and the DM learns of it by the chat's unread mark only — no sound, no banner. Whether
  that is quick and noticeable enough at a real table is for the playtest; a shorter way is a
  follow-up, not built here.
- After "Understood" the card goes without a word of thanks, and focus returns to the page.
- The audit's reviewed findings, none from this stage's own layout: `content-too-wide` on the TV
  (a TV fills its screen on purpose); `fixed-over-heading` where the modal guide stands over the
  lobby's slot (the dialog is above it); the Music panel's `row-content-misaligned`, as before.
- Not tried: a phone's on-screen keyboard over the form, a screen reader's actual speech, a real
  TV, the native apps. No child has read the page: the wording in both languages had one
  independent copy pass, not a reader of nine.
- `pnpm run db:migrate` was run only inside the integration tests' throwaway databases, never on
  the shared development database; nothing was run on a deployment. No human has played it.

## For the owner

- Read the Russian page as a child would: the four tones and the eight "not in this game" lines
  are the session's wording (`apps/web/src/i18n/ru-agreement.ts`).
- The open point from the plan stays open: when AI is on, should "not in this game" bind the
  narrator's prose and the NPCs' talk? Nothing reads the agreement today.
- Play acceptance is the owner's: write the page, show it on the TV, press "Understood" on a
  phone, ask for a pause from "How to play" and see it arrive in the DM's Chat.
