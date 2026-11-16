# Stage 799 completion — the package's close

Work order `work-orders/STAGE_799.md`; program `docs/MEMORY_RITUAL_PLAN.md` (the last stage of
Part 2); the owner's word of 2026-11-16, «продолжаем», the word of 2026-11-15, «не спрашивай
меня, а действуй по плану до конца» (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`), and the word
of 2026-11-16 that moved the work to a cloud session; 2026-11-16. Status:
**AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-799-package-close`, stacked on Stage 790's.
Session model: Claude Fable 5.2.

**Read first.** Stages 790 and 799 and the last three commits of Stage 780 were made in a cloud
session whose network refuses Playwright's download host: WebKit could not be installed there,
so the `ipad` and `webkit` projects were run by that session on none of the three branches.
What stands for WebKit is CI's word. Stage 780's pull request (44) is green on its fix. Stage
790's (46) and this one (47) were red in their first runs on a different journey each time — none
of it these stages' code. Stage 790's report says what was found in the suite and answered:
journeys left their pages open; the next game's date was read stale; and the dev server's client
reloaded a WebKit page whose connection to it had closed (this close's own journey lost its page
that way once, on the iPad project). On the way pull request 47 was green whole on commit
`2af141ea`, WebKit included. Read the CI of the last commits before merging.

This is where the session stops: the plan puts the family playtest — the owner's — after the
package.

## What the package is, as it stands

| Stage | What a table gets                                                            | Pull request |
| ----- | ---------------------------------------------------------------------------- | ------------ |
| —     | The plan                                                                     | 37 (draft)   |
| 710   | An evening closes with its chapter; the next one opens with "Previously…"    | 38           |
| 720   | A star for the table and a wish for the DM at an evening's end               | 39           |
| 730   | The next game's date on every screen, and its calendar file                  | 40           |
| 740   | The table's agreement, the quiet ways to the DM, the DM's guide              | 41           |
| 750   | Not done: the shells hand over the calendar file and print — waits for PR 32 | —            |
| 760   | Part 1's checkpoint                                                          | 42           |
| 770   | The book of the campaign and its gallery, on screen and on paper             | 43           |
| 780   | A campaign's end, keepsakes, "Adventures we finished"                        | 44           |
| 790   | Text size, the DM's break reminder, cheers at the table                      | 46           |
| 799   | This close                                                                   | 47           |

Each stands on the one before: merge in that order. Migrations 0040–0043 are additive; Stages
770, 790 and 799 have none.

## What the close did

- **One journey over Part 2** — `tests/e2e/keepsakes-checkpoint.spec.ts`, with the DM, two
  players and the table's screen: a cheer on the TV and on both other screens; one player's text
  at its largest and nobody else's changed; the DM's break — "Break" on the TV, both players
  waiting, the table back; the last evening closed with its chapter and a star; the campaign
  finished with closing words in both lobbies; a keepsake chosen by a player and one by the DM
  for another; the whole book on a player's screen down to "The end", with no wish in it;
  applause for its last page in a finished campaign; the adventure, its heroes and what they
  keep in the DM's list of campaigns.
- **What each screen was sent**, in that journey: the TV — the chapter, the star, the DM's
  closing words, a cheer's mark, no wish, none of the party-forbidden markers of the DM's
  secrets; a player — her own wish and none of the markers forbidden to her character; the other
  player — not that wish; of a cheer, its ID, its mark and who gave it, nothing else.
- **The adversarial pass over every new read of Stages 770–790** (below), which found one
  defect, fixed here.

## Found and fixed by the close

- **The account's list named a hero the party has not met.** Of a finished campaign the list
  (`GET /account`, Stage 780) gave every keepsake with its hero's name, whoever the hero was:
  a keepsake the DM chose for a character hidden from the party put that character's name on
  the home screen of every member's account. Inside the campaign the same keepsake is read
  without a name (ADR 0072 §2.4), and the ADR says the list shows what a member reads as the
  party (§2.6). The list now leaves out a keepsake of a hero the party does not know
  (`accounts/accounts.ts`; `accounts/finished-campaigns.test.ts` fails without the fix: the
  sentinel's name was in the body). It took the DM choosing a keepsake for a hidden character
  to happen; no journey did.

- **The journey's own findings, left as found.** At a laptop's size the finished adventure's
  card, tall with its keepsakes, lies over the top of an open sheet — where Stage 790 put the
  row of cheers in Dice. The journey applauds from Chat, whose row stands lower; a player who
  wants to applaud the last page from Dice has to close the card's column first or use Chat. And
  the table's screen asks for nothing of a campaign's end: no cast shows "The end", by Stage
  780's decision.

## Verification

Run on the branch on 2026-11-16 in a cloud session (a four-core container, Node 24, PostgreSQL 16
— the project's is 18; offline, no paid call), on the finished tree of the whole package:

| Check                                                         | Result                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`                  | pass                                                                                                                                                                          |
| `pnpm run context-budget`                                     | pass; one earlier warning (`scripts/campaign-shared/combat-kit.ts`)                                                                                                           |
| `pnpm run test` (unit)                                        | 581 files, 4662 tests pass                                                                                                                                                    |
| `pnpm run build`                                              | pass                                                                                                                                                                          |
| `pnpm run test:integration` (PostgreSQL, throwaway databases) | 81 files, 398 tests pass                                                                                                                                                      |
| `pnpm run test:e2e`, Chromium project, whole                  | 347 journeys, 41.6 minutes: 339 pass; 8 ran out of their 30 seconds and **all 8 pass when run alone** (below)                                                                 |
| `pnpm run test:e2e`, `ipad` and `webkit` projects             | **not run here**: no WebKit in this environment. In CI Stage 790's passed on the iPad project in every run; the close's in all but one, when the dev client reloaded its page |

The eight that ran out of time (30.2–35.0 s) with nothing else running on the machine:
`combat-lifecycle.spec.ts:17`, `combat-turn.spec.ts:18`, `dm-history.spec.ts:66`,
`light.spec.ts:21`, `live-stand-in.spec.ts:43`, `live-undo-notice.spec.ts:20`,
`live-world.spec.ts:23`, `party.spec.ts:46` — two-screen journeys of fights and live play, none
of this package's. Alone they take 9–27 seconds. Across this session's three whole runs the
count was 7, 3 and 8, and `combat-lifecycle.spec.ts:17` was among them every time: on this
container the suite's 30 seconds leave the heaviest journeys no room when two workers share four
cores with four servers. Hosted CI allows them 90. Whether the package made them slower was not
measured: every screen now reads one more view (`cheers`) and the journeys' servers hold ten more campaigns than at Stage 770; the journeys that timed out in Stage 780's run, before the
comforts, were of the same kind. **CI's word, as far as it has been heard**: Stage 780's pull
request, on its fix (commit c401faca), finished with no failed check on any of the three
projects — heard as a GitHub event, the session's connector to GitHub's API being down at the
time; its earlier run on the commit before had failed seven journeys, six on the defect the fix
removes.

## Adversarial pass over every new read of Stages 770–790

Read again in the code; held by the tests named.

| Read                                                               | Who gets what                                                                                                                                        | Held by                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A session's real days, `playedFrom`/`playedTo` on `GET …/sessions` | Every member and the TV: two instants, nothing of the world                                                                                          | `memory/decide.test.ts`                                                                               |
| `GET …/reflections?book=true`                                      | As the stars' read: stars to all at the table and the TV, a wish to its author and the DM; the book asks as the party and is sent no wish            | `reflection-routes.test.ts`; the players' browsers in `campaign-book.spec.ts` and the close's journey |
| The book's reads (the client, as PARTY)                            | Whoever opens it, the DM too, reads the party's chapters, stars, handouts, names and pictures; a chapter of another perspective is dropped again     | `book-model.test.ts`, `campaign-book.spec.ts`                                                         |
| The account's `chapters`                                           | The account, for its own campaigns: a count of the party's chapters                                                                                  | `accounts.test.ts`                                                                                    |
| `GET …/ending`                                                     | The end, the DM's closing words and every keepsake to every member and the TV, heroes named as the reader knows them; whom the reader may choose for | `ending-routes.test.ts`                                                                               |
| The account's `finished`                                           | The account, for its own campaigns: the days played, the heroes the party knows and what those heroes keep; no picture                               | `finished-campaigns.test.ts` (the fix above), `accounts.test.ts`                                      |
| A person's copy: keepsakes, the DM's closing words                 | The person: their own heroes' keepsakes; a DM their own closing words                                                                                | `privacy.test.ts`                                                                                     |
| `GET …/cheers`                                                     | Members in a character's or the DM's view, and the TV: a mark of five and who gave it, named as the reader knows them; gone in six seconds           | `cheer-routes.test.ts`, `cheer-board.test.ts`; three screens in the close's journey                   |
| The live inventory: `ending` (all), `cheers` (who reads it)        | A signal only to who reads the view; the party's view on a person's screen is not signalled of a cheer                                               | `live/inventory.test.ts`, `cheer-routes.test.ts` (the shared board)                                   |

Looked for and not found: a write of these stages that reaches the world (the end, a keepsake, a
cheer and the break are table data or the pause and cast that existed; the book and the comforts
write nothing); a view that changes for one reader when another writes something that reader may
not read; free text reaching a screen through a cheer; a route of these stages a table display
can write to.

Left as designed, for the owner to know: a keepsake is a deliberate share — choosing a thing
tells the table its name as its hero knows it, and the DM may choose or take away anyone's; a
keepsake's and a cheer's hero is sent by ID even where the reader is not given the name, as a
star's author is; the DM's closing words and a keepsake's line are free text the whole table and
the TV read; a finished campaign refuses play and still takes table talk, cheers, stars and
keepsakes.

## Not verified — what the playtest is for

- **No human has played any of Part 2**, and it was built before the playtest that was to
  re-read it. Every check here is a machine's: journeys, layout looks, an independent UX pass by a reviewing agent in each stage. Stage 780 above all is a draft of what "finished" means at a
  table.
- **WebKit, by this session.** Nothing of Stages 790 and 799 ran on WebKit anywhere but in
  their pull requests' CI. That the reloads of WebKit pages are gone is shown only by CI runs to
  come; why WebKit drops its connection to the dev server is not known (Stage 790's report).
- **The whole suite after the suite's own fixes.** Run whole on Stage 790's branch (346 of 346
  on Chromium in 28.5 minutes, one commit before its last); here only CI runs the whole.
- **An iPad page that never shows its world.** With the reloads gone one failure is left in
  CI, old and not explained: now and then on the iPad project a page that entered the world
  never shows its dock, and the journey runs out of its three minutes
  (`[ipad] evening-ritual.spec.ts:35` on this pull request's commit `f663f59d`; the same on
  `main` before this package, `[ipad] dm-screen.spec.ts`). Stage 790's pull request was green
  whole on the same code. CI keeps no screenshot, so a failing journey now writes what its pages
  showed and which requests they still waited for into the job's log
  (`tests/e2e/support/pages.ts`): the next occurrence can be read there.
- **Paper.** The book's print was checked in Stage 770 as Chromium's PDF; no page was printed,
  and Safari's print was not tried.
- **No real device**: not a phone (the keyboard over a card, the largest text under a thumb), not
  a TV (system emoji on its browser; 4K was a window), not the native apps (the book's "Print"
  and the calendar file wait for Stage 750; everything else is the same web client, not tried in
  a shell here).
- **A screen reader's speech** was not heard anywhere in Part 2.
- **Seven or eight journeys run out of time in each whole run on this container** and pass
  alone (above). That it is the machine was not proved; CI, with three times the allowance, is
  the second word.
- **`next-game.spec.ts:60` failed on both engines in Stage 770's CI** and passes everywhere
  since; **`[ipad] agreement.spec.ts:27` failed once in Stage 780's first CI run** and not in
  its second. Neither was explained.
- **Narrated chapters**: prose was the local narrator's or the plain record; no paid provider
  was called in any stage.
- Nothing was deployed; migration 0043 ran only in tests' throwaway databases; the shared
  development database was not touched.

## For the owner

**Done since this was written**: on the owner's word of 2026-11-16 («доделывай и сливай») the
whole package was merged into `main` as one merge of PR 47 (`2fc04704`) — the tree whose CI ran
green whole, Chromium, the iPad project and WebKit — and PRs 37–46 are closed with it, their
commits inside that merge. Nothing is deployed. Step 1 below is therefore history; steps 2 and 3
stand, and so does what PR 32 needs.

1. **Merge, in order**: PR 37 (the plan) → 38 → 39 → 40 → 41 → 42 → 43 → 44 → 46 → 47. Each is
   stacked on the one before; after a merge the next one's base moves to `main` by itself or by
   one click. Read the CI of 46 and 47 first. PR 32 (Stage 750's ground) adds two specs that open
   pages of their own, `display-room.spec.ts` and `native-polish.spec.ts`: whichever lands
   second, give them the journey `test` (`tests/e2e/support/journey.ts`, one import each) and
   take their names out of `tests/architecture/journey-pages.test.ts`.
2. **Deploy** when you choose: four additive migrations (0040–0043) run on start as usual; an
   older build leaves their tables alone. One thing to know: a build from before 0043 plays a
   finished campaign on, since only the newer build knows of the end.
3. **What the family playtest is for.** Part 1 asks whether the ritual is performed at all: an
   evening closed with its chapter, stars and wishes on the phones, the next date in a real
   calendar, a second evening opened with "Previously…". Part 2 asks what is worth keeping:
   - _the book_ — print it, or save it as a PDF, after two evenings: is it something you would
     send to a grandmother?
   - _the end_ — finish a short campaign for real: should a finished campaign refuse play at
     all, is one keepsake right, do children choose on phones or together at the table?
   - _the comforts_ — does anyone use the larger text; does the DM want the reminder, or switch
     it off after one evening; do cheers add to the table or pull eyes to the phones? Each can be
     removed without harm to the others.
     What the playtest shows decides which of the "Session's decisions" in each report stand.
4. **Decisions the session made for you** are in each stage's report. The ones most worth a
   look in Part 2: a finished campaign is read, not played, with a short list of exceptions; one
   keepsake a hero; no picture in the account's list; system emoji for the cheers and the name
   "Without words" on their row; the break's count kept in the DM's browser.
5. **Open points left open**: pictures outside a campaign's session (the account's list has
   none); whether "The end" should have a cast for the TV; whether "not in this game" should
   bind AI's prose (from Part 1); a shorter way to a pause; players' notes and backstory; client
   error reports; off-host backup copies (a separate task on your word).
6. **Stage 750** (the shells hand over the calendar file and print) starts after PR 32 merges.
7. **Two follow-ups this session saw and did not take**: `next-game.spec.ts:60`'s failure in
   Stage 770's CI, and the TV that keeps its pairing code under load in the test servers
   (`table-display.spec.ts:65`, and twice more in this session's runs:
   `agreement-screens.spec.ts:28`, `release.spec.ts:85`).
