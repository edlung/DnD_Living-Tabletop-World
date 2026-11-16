# Stage 790 completion — small comforts

Work order `work-orders/STAGE_790.md`; program `docs/MEMORY_RITUAL_PLAN.md` (Part 2, section 790);
the owner's word of 2026-11-16, «продолжаем», the word of 2026-11-15 to follow the plan without
asking (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`), and the word of 2026-11-16 that moved
the work to a cloud session, «перенеси часть работы в облако»; ADR 0072 §3; 2026-11-16. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-790-small-comforts`, stacked on Stage 780's
(PR 44, not merged). Session model: Claude Fable 5.2.

**Read first.** This stage was built in a cloud session whose network refuses Playwright's
download host: WebKit could not be installed, so nothing here was run locally on the iPad
project. The pull request's CI is the only word on WebKit; see "Not verified".

The plan wanted Part 2 re-read against the family playtest, which "decides which of them are
worth their screens". It has not happened: the three comforts are small, each can be left
unused, and none changes what was there before.

## What changed

- **Text size for each viewer.** A person chooses "Normal size", "Larger" or "Largest" (100%,
  112.5%, 125%) in two places: the Dice sheet's settings — now "This screen: sound, motion, text
  size" — and the first page of "How to play", where a newcomer reads first. It is kept in the
  browser beside the dice settings and is the size of every page that person reads there: the
  game, the list of campaigns, signing in, the workshop, the privacy notice. The table's display
  and paper keep their own measure.
- **A break reminder for the DM.** On the Session sheet, while a session plays: "Remind me to
  take a break — Don't remind me / After 60 minutes of play / After 90 minutes of play", off
  unless chosen. When the time has come a quiet card among the table's questions says "60
  minutes at the table. Time for a break?" with "Take a break" and "Ask again in 15 minutes".
  Taking it pauses the game — that is the break — and shows a title card, "Break — We will be
  back at the table soon.", on the table's screens (the `title` cast that exists). The card then
  says what happened ("…and the table's screens say “Break”" only where a screen is paired or
  the table plays online) and offers "Back to the game". The break ends with that button or with
  "Resume the game" on the Session sheet; either way the screens show again what they showed
  before, unless the DM has cast something else meanwhile. The count is the DM's browser's own.
- **Cheers at the table.** First in the Dice sheet and above the message in Chat, a row labelled
  "Without words": five marks — applause, a laugh, "Wow!", "Scary!", a heart ("Love it!") — as
  the system's emoji. One press shows it for a
  moment on every screen of the table and on the table's display, with the name of who gave it
  (the reader's own name for them; "The DM" for the DM). The server holds a cheer in memory for
  six seconds and stores nothing.
- **Session's decisions**: all of ADR 0072 §3 — the three steps and where the size applies; the
  break's count in the browser, its two rests (a pause of five minutes, ten minutes unseen), no
  new server state and no new cast kind; the name "cheers" (a "reaction" is a rule of the fight)
  and the five marks as system emoji text, which settles the plan's open point on their art; who
  gives and who reads; a finished campaign still takes a cheer (named in
  `apps/server/src/ending/guard.ts`), an away campaign refuses it, a paused game takes it.

## Found and fixed on the way

- **The break did not survive a table without a screen.** On a server with no table's display
  the cast is refused; the first version paused the game, lost the cast, and left the DM with a
  paused game and no card to come back by. The journey on the token servers caught it. The pause
  is now the break; the screens are told where they can be, and the card says only what happened.
- **A status that was always there.** The layer of cheers kept an empty `role="status"` line on
  every screen, and two older journeys that expect a page's one status
  (`perspectives.spec.ts:31`, `perspective-choices.spec.ts:13`) broke — the same kind of defect
  this session had just mended in Stage 780, made again and caught by the whole suite. The line
  is polite without the role.
- **A module named twice.** `comforts/cheers.ts` beside `cheers.tsx` built to one output file:
  the build caught it (typecheck does not); the data module is `cheer-marks.ts`.
- **From the layout look** (420 screenshots, twice): on a phone a cheer's name ran off the left
  edge of the screen (cheers now keep inside a band with a gutter); the row's label wrapped
  mid-row (on a narrow screen it takes its own line); at the largest text on a 1440-pixel screen
  the Russian top bar squeezed the campaign's name to "Пропав…" under the "Live" pill (at the
  larger steps the wordmark and the session's title leave sooner); the break card lay over the
  place's cartouche at the larger steps (it is narrower).
- **From the independent UX, copy and accessibility pass** (no blocker; of eleven "should fix" ten
  taken, and twelve smaller points): the break card went on saying "paused" after
  the DM resumed from the Session sheet (the break now ends when the game plays again); after
  "In 15 minutes" the card said "60 minutes" at 75 (the putting off no longer rewrites the
  count); the text size was two scrolls deep in Dice for the very person who cannot read small
  text (its second door is the guide's first page); on a phone the row of cheers was at the far
  end of the Dice sheet (it stands first); "the table's screens say “Break”" was claimed with no
  screen paired (said only where one is, or online); "Back to the game" overwrote whatever the DM
  had cast during the break (it puts the scene back only if the screens still say "Break");
  focus fell to the page and nothing was said when the card went away (its last word — "The game
  is on again.", "I'll ask again in 15 minutes." — stays a moment where the card was and holds
  the focus); the break select's help was not tied to it; the card's buttons were 36 pixels high
  (44); the guide's page cut at an edge with no sign of more (it fades, as Chat's log does).
  Words: "Cheer the table" / «Поддержать стол» became "Without words" / «Без слов»; "Remind me
  of a break" → "Remind me to take a break" / «Напоминать о перерыве»; "Never" → "Don't remind
  me" / «Не напоминать»; "In 15 minutes" → "Ask again in 15 minutes" / «Напомнить через 15
  минут»; "Love it" / «Нравится» → "Love it!" / «Здорово!»; the Session sheet's help and the
  guide's two lines rewritten; «в чате» → «в «Чате»» in the older guide line. Not taken: hiding
  the table's questions under an open sheet on a short landscape screen (the break card joins a
  column that already lies there; the pause banner does the same); a repeated cheer by the same
  person is not announced a second time to a screen reader; long hero names break mid-word in
  the party rail at the largest text, and the Russian dock's short words nearly touch at 320
  pixels (both as the rail and the dock were, at a size they had not met).

## Files

Contracts `session/cheers.ts`. Server `src/cheers/` (`cheer-board.ts`, `cheer-routes.ts`),
`http/app.ts`, `live/live-app.ts`, `live/inventory.ts`, `ending/guard.ts`,
`testing/ui-party-campaigns.ts`. Client `comforts/` (`cheer-marks.ts`, `cheers.tsx`,
`break-timer.ts`, `break-reminder.tsx`, `text-size.tsx`), `dice/settings.ts`,
`dice/dice-panel.tsx`, `chat/chat-sheet.tsx`, `guide/guide.tsx`, `alerts/table-asks.tsx`,
`dm/session-running.tsx`, `display/display-app.tsx`, `main.tsx`, `styles/comforts.css`,
`styles/base.css`, `styles/guide.css`, `styles/print.css`, `i18n/ru-comforts.ts`,
`i18n/ru-guide.ts`. Journeys `tests/e2e/comforts.spec.ts`,
`comforts-screens.spec.ts`; `playwright.config.ts` (the iPad project runs `comforts.spec.ts`).
No migration.

## Verification

Run on the branch on 2026-11-16 in a cloud session (a four-core container, Node 24, PostgreSQL 16
— the project's is 18; offline, no paid call):

| Check                                                         | Result                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                  |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`), none from this stage                                                             |
| `pnpm run test` (unit)                                        | 581 files, 4661 tests pass                                                                                                                            |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 81 files, 398 tests pass (run before the pass's client changes; no server file changed after)                                                         |
| `pnpm run build`                                              | pass                                                                                                                                                  |
| `pnpm run test:e2e`, Chromium project, whole                  | 346 journeys, 38 minutes: 339 pass, 7 fail — two on the stage's own defect above, since fixed; three out of their 30 seconds; two TV journeys (below) |
| `pnpm run test:e2e`, `ipad` and `webkit` projects             | **not run here**: no WebKit in this environment. The pull request's CI runs them                                                                      |
| The layout look (a temporary journey, not committed)          | 420 screenshots twice: 14 screens × 5 sizes (1440, 768, 390, 320, 832×400) × 3 text sizes × 2 languages, and the TV; measured and looked at (below)   |

The whole Chromium run, in detail. Seven failed: `perspectives.spec.ts:31` and
`perspective-choices.spec.ts:13` on the status line above; `combat-lifecycle.spec.ts:17`,
`conversation.spec.ts:44` and `live-combat.spec.ts:84` out of time (30.6–35.2 s; the first of them
runs out of time on this machine in every whole run, Stage 780's too); and two journeys with a
TV, `agreement-screens.spec.ts:28` and `release.spec.ts:85`, in which the TV stayed on its
pairing code after the DM paired it — what Stage 770's report describes for
`table-display.spec.ts:65` and reads as the test servers' own. **After the fix all seven pass**,
run together with the stage's journeys and `table-display.spec.ts` (17 journeys). The whole
project was not run a second time after that one-line fix: the pull request's CI does, on all
three projects.

The stage's journeys: `comforts.spec.ts` (the text size from the Dice sheet, kept through a
reload, the same choice on the guide's first page, axe at the largest size; a cheer on the
giver's screen at once and on the DM's a moment later, gone from both, the DM's from Chat, and
nothing held by the server afterwards; the reminder off until asked, the card, the break as a
pause where no screen can be told, a reload that keeps it, the table back, the card's last word
and the focus) and `comforts-screens.spec.ts` (with a paired TV: the cheer with its giver's
name, "Break" on the TV, and the break ended from the Session sheet with the scene back).
`atmosphere.spec.ts` follows the renamed settings. Unit and HTTP tests: the board, each giver
and reader, the fixed marks, the six seconds, the rate, a finished campaign, a table display,
the live signal through the shared board, the inventory, the break's count.

The layout look: the measured rules found no sideways scroll and nothing past a screen's edge at
any size, text size or language; the rest was looked at — what it showed is under "Found and
fixed". Reviewed and left: at the largest text on a 320-pixel phone the guide's pages scroll
(they fade at the edge); on a short landscape phone the table's questions, the break card among
them, lie over an open sheet as they did.

## Adversarial pass (invariants 1–5, 11)

- The world is untouched: a cheer is held in the process's memory and read by no decision; the
  break is the pause and the cast that existed; the text size and the break's count never leave
  the browser. No command, no event, no table.
- Who gives a cheer: a player as the character they play, the DM as the DM or as a character the
  DM plays; another's hero 403, the DM's view for a player 403, the party's shared view and the
  public one 403, a stranger 404, nobody 401, a table display 401/403.
- What a cheer may carry: a mark of the fixed five and an ID; any other mark, an emoji sent in
  its place, free text, or a character named in the body is 400. There is no way to put words
  on another screen through it.
- What a cheer shows: the mark and who gave it, named as the reader knows them — a character the
  reader does not know is unnamed ("Someone"). Its ID is sent, as an author's is with a star.
- Who reads: members in a character's or the DM's view, and a table display; the same readers
  have the read in their live inventory, so its signal tells nobody anything they do not read.
  The party's shared view on a person's screen neither reads nor is signalled.
- Kept nowhere: gone from the read after six seconds (tested with the clock); twelve a campaign
  at most; a campaign with none held is forgotten by the board; nothing is in a person's copy,
  the move's tables or a log line.
- The rate: thirty a minute for one person in one campaign, then 429 for that person alone.
- A finished campaign: play is refused (409) and a cheer is taken; the list of what a finished
  campaign still takes names only routes that exist (the test of Stage 780 covers the new name).
- The break: the DM's own writes (`POST …/lobby`, `POST …/display/cast`), each already the DM's
  alone; the title card's two lines are fixed words in the campaign's language. Its reads are the
  DM's own too (the lobby, the cast, the list of screens).
- Looked for and left as designed: anyone at the table can cheer thirty times a minute, and
  every cheer makes each screen read its views again (ADR 0072 §3, consequences); a DM playing a
  character cheers under that character's name; the break's count can be reset by anyone with
  the DM's browser, since it lives there.

## Not verified, and limits

- **WebKit.** No journey of this stage ran on the iPad project anywhere but in the pull
  request's CI; `comforts.spec.ts` is in that project. Read its result there before trusting it.
- **The whole suite on the last commit.** The whole Chromium run was on the commit before the
  status line's fix (above); after it only the failed journeys, the stage's own and their
  neighbours were run. CI runs the whole.
- **No human has used it**, and Part 2 was not re-read against a playtest. Whether a DM wants to
  be reminded, whether children cheer or drum on the button, whether "Largest" is large enough
  for a grandmother — unknown.
- **System emoji look different on every device**, and a TV's browser or an old web view
  without a colour emoji font would show boxes. Checked only in this environment's Chromium
  (Noto Color Emoji).
- **A screen reader's speech** was not heard: the cheers' polite line, the break card's last
  word and the focus after it were checked by code, by axe and by the journeys' focus
  assertions.
- **A cheer reaches other screens with the live signal's next comparison** — a second or two —
  and each cheer makes every screen of the table read its views twice (given, gone). Not
  measured with a full table clapping at once.
- **The break's count is one browser's**: a DM who moves to another device mid-session starts it
  again; it cannot tell a table that talked for an hour without touching the app from one that
  played.
- **Cheers behind an open book.** The Chronicle and the character sheet are modal dialogs:
  a cheer is not shown over them, and the row is not reachable from inside them. A table reading
  the last page together sees the applause on the TV and after closing the book.
- **PostgreSQL 16, not 18**, ran the integration tests here (none is this stage's); CI's are on 18.
- Not tried: a real phone, a real TV, the native apps. Nothing was deployed; there is no
  migration.

## For the owner

- Say which of the three is worth its screen at your table; each can be removed without harm to
  the others.
- Play acceptance is the owner's: set the largest text on a phone and look through an evening's
  screens; turn the reminder on and play an hour, or take a break from it; cheer from two phones
  with the TV on.
