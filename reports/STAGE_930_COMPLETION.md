# Stage 930 completion — play from the book, and the close of the program

Work order `work-orders/STAGE_930.md`; program `docs/DM_BOOK_PLAN.md` (section 930); ADR 0074 §4;
2026-11-22. Status: **AWAITING_OWNER_DISPOSITION** — the last authorized stage; this is the
report to the owner. Branch `claude/stage-930-play-from-the-book`, stacked on Stage 920's
(https://github.com/edlung/DnD_Living-Tabletop-World/pull/75).

**On whose word.** The owner's of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`). Every
design point of this stage is the session's (ADR 0074 §4) and stays his to overrule.

## What changed in this stage

- **A roll is asked from the page or the card.** Beside each option the book read from the
  campaign's check line: whom to ask (a hero or the whole party) and "ask for the roll". The
  table's own check request goes out with that check and that difficulty; the answer comes back
  to the same place — "waiting", then the total and success or failure, as the server says. The
  difficulty never reaches a player.
- **A prepared fight starts from its card**, or the card says why it cannot start now ("nobody
  of the party is at … yet"). Started, the book steps aside for the battlefield.
- **A handout is given to the party from its card**, as any handout is given.
- **The picture goes to the table's screen** on a press under it; a chapter's opening can go
  with its words to read aloud when they fit.
- **The Dice section is a bookmark**, for a roll the text did not foresee, and returns to the
  page like every bookmark.
- **The book's journey runs in the iPad project too** (WebKit), with a campaign of its own.

No server code, no contract, no migration and no command changed in this stage.

## Not done, and why

- **A clue is not handed to the party from its card.** The product has no command by which the
  DM gives the party a clue: clues are found by examining and by checks. The work order forbade
  new commands for the book, and I added none. The contents still show "there is a lead" when a
  clue is found the usual way.
- **A fork is not marked.** The DM's note on the page holds what the table chose.
- **The table's screen does not follow the ribbon.** A cast is the DM's press. A turned page is
  too quiet an act to change what the whole table sees.
- **A fight is not run on the right page**: it is run on the product's battlefield.
- **A campaign's handouts are not imported into the DM's kept handouts**: they are given
  straight from the card.
- **A meeting** is started, paused and ended in the Session section behind its bookmark; the
  book has no second set of those controls.
- **Starting a fight from the book was not pressed in a journey**: in the test campaign nobody
  stands at the fight's place, so the journey checks the card's refusal. The start itself is the
  same call the Encounter section makes, covered by that section's own tests.

## Verification

| Check                                                                                         | Result                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`, `context-budget`                                | pass (2,949 files)                                                                                                                                 |
| `pnpm run test` (unit)                                                                        | pass, 5,083 tests (one run of two had `ui-workshop-edits.test.ts` time out under load; it passes alone and in the second run, as on the base tree) |
| `pnpm run build`                                                                              | pass                                                                                                                                               |
| Journeys: `dm-book` in Chromium and in the iPad project (WebKit), `dm-book-library` — five    | pass                                                                                                                                               |
| in them: a roll asked from a card and seen by the DM with its difficulty, by a player without | pass                                                                                                                                               |
| a handout given, a picture cast, the fight card's refusal, the Dice bookmark and back         | pass                                                                                                                                               |
| Layout audit of the new controls at 1440, 1180, 1024, 768 and 390 px                          | no finding left                                                                                                                                    |

Not run: the whole integration suite and the whole journey suite (CI runs them on the pull
requests); a real tablet and a real TV — that is Stage 940, the owner's.

## The program against the owner's checklist (`docs/DM_BOOK_PLAN.md`)

| #   | The point                        | Where it stands                                                                                                                                                             |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Any of the 55 opens as a book    | 53 do. The two built-in adventures have books that stay closed until the owner has read them (Ravenford's six pages are in `reports/STAGE_910_COMPLETION.md`); Russian only |
| 2   | A name in the text is a link     | Done: 1,250 of 1,323 pages have at least one; the other moments are listed on the right page                                                                                |
| 3   | The picture on the right         | Done from the pictures that exist (places, portraits); pictures of scenes and events are Layer 2                                                                            |
| 4   | Bookmarks                        | Done: party, places, journal, encounter, dice, session, rules, history, Chronicle. No "people" section exists to open                                                       |
| 5   | The path through the chapters    | Done as the contents: here, played, next, "there is a lead"; any chapter opens. The ribbon follows a turned page and that turn can be taken back                            |
| 6   | A moment is played from its card | A roll, a fight's start, a handout: done. A clue: not done (no command exists)                                                                                              |
| 7   | A meeting from the book          | Through the Session bookmark                                                                                                                                                |
| 8   | The book looks like its campaign | Done from the existing materials, accent and lettering; its own materials are Layer 2                                                                                       |
| 9   | The dock is still there          | Done: nothing was taken away                                                                                                                                                |

## What waits for the owner

1. **Five pull requests, stacked, none merged**: 72 (the editorial work of another session, as
   it was), 73 (Stage 900), 74 (910), 75 (920), 76 (930). Merging and deployment are his.
   Migration 0049 goes with 75.
2. **Reading**: Ravenford's six pages (quoted in the Stage 910 report) and Hollowmere's eight
   (`docs/design/dm-book/story.js`). Until `awaitingReading` is removed, those two books stay
   closed.
3. **Decisions the session made for him** (plan decisions 9–16; ADR 0074 marks each): the book
   beside the packages, not in them; both built-in books closed; the cast only on a press; no
   clue handed out and no fork marked without a command for it; the contents called «Оглавление».
4. **Stage 940**, a real meeting by the book on a tablet and a TV, and **Stage 950**, the
   second layer — neither is authorized.

## Risks

- The stack stands on pull request 72, which this session did not write.
- The first layer shows the campaigns' scene text as it is: for 1,284 of 1,323 pages that is
  text written to the DM, to be told in one's own words. The book says so on each page; it does
  not read like the demo's narration, which was written for two chapters of one campaign.
- 123 check lines could not be read as fields; those rolls are asked by hand from the Dice
  section.
- A campaign already running on the server gets its book only if its package is one the library
  recognises (by digest or by name with every key present). The owner's live campaigns were not
  checked: that needs his sign-in.
