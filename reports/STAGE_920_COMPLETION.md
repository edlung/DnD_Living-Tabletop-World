# Stage 920 completion — the book to read

Work order `work-orders/STAGE_920.md`; program `docs/DM_BOOK_PLAN.md` (section 920); ADR 0074 §3;
2026-11-22. Status: **implemented, the program continues** (the owner chose Stages 900–930 without
stops). Branch `claude/stage-920-book-to-read`, stacked on Stage 910's
(https://github.com/edlung/DnD_Living-Tabletop-World/pull/74).

**On whose word.** The owner's of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`). Every
design point of this stage is the session's (ADR 0074 §3) and stays his to overrule.

## What changed

- **A Book button in the DM's dock**, first among the DM's tools, where the campaign has a book.
  It opens the book as a section of the shell, full screen with Close, like every other.
- **The spread.** Left page: chapter and place, the title, whom the text speaks to ("read aloud",
  "can be read aloud", "for the DM: tell it in your own words"), the text, the ribbon, the way on.
  Right page: the picture with a caption that says what it shows, then "how we play this" — for a
  chapter's opening its purpose, the author's note, its length, the campaign's notes for that
  evening and for a changed plan; for a page its roll (skill and difficulty as chips, the line as
  written), what follows a failure, what the players may choose — then the people and events of
  the page and the DM's own note.
- **Cards.** A name in the text, or a line under "people and events", opens a card in the
  brief's place: a person (looks, what everyone knows, wants, speaks, will not, knows; the secret
  folded away), a clue, a handout with its text, a fight, a puzzle with hints one at a time, a
  written moment of the built-in adventures. Closing it returns to the words it was opened from.
- **Pages that turn.** The left page's text is cut into sentences and shown in as many screens as
  it needs at the screen's size; "Read on" goes through them and then to the next page.
- **The ribbon** is kept by the server for the DM (`ltw_dm_book_places`, migration 0049). It
  follows the turn to the next page from where it lies — and that turn can be taken back at once
  ("the ribbon moved here · take it back"). Reading back, opening another chapter from the
  contents and reading on from there leave it. "Lay the ribbon here" moves it by hand.
- **The contents** (the path): every chapter with its place and a hint — the party is here,
  played, next by the book, "there is a lead" (a found clue is about its place) — and the
  campaign's own sentence about its order. Every chapter opens; nothing is locked.
- **Bookmarks** to the party, places, journal, encounter, session, rules, history and the
  Chronicle. A section opened from the book — by a bookmark or by the dock — returns to the book,
  at the same page, when closed.
- **Which campaign has a book**: one published from a library package (found through the record
  of its publishing, by digest, or by the campaign's name when the package is no longer shipped as
  it is), and a Russian campaign of a built-in adventure once its book has been read by the owner.
- **Nobody but the DM**: `GET …/dm/book` and `POST …/dm/book/place` answer a player, the table's
  screen and another table's DM with the DM routes' 404. Neither sends a command.

## Changed against the work order

- A check and a fork are sections of the brief, always in view, not cards to open.
- The map is the Places section, one press from the contents; a map inside the book is not built.
- No bookmark "people": the product has no such section; a person opens from the text or the
  page's list.
- In Russian the book says «мастер», «отряд», «материал», as the rest of the product does, and
  the path is «Оглавление».
- Stage 910's data gained one field in this stage: a clue's `subjects`, so that a found clue can
  point at a chapter's place. The 53 books and the two built-in books were rebuilt.

## Found and fixed on the way

- **By the journeys**: a bookmark without a name on a narrow screen; the book of the campaign
  opened before staying on screen after another campaign was opened in the same tab; `GET` for a
  campaign without a book answered 404, which the client reads as a lost sign-in — it answers
  `{ "book": null }` to the DM now.
- **By the layout audit** (five sizes, both built-in and library campaigns): the main button's
  hover took the shell's pale fill and lost its words; the text-size switch wrapped to a row of
  its own; the note field's edge was under 3:1; a long card could not be scrolled from the
  keyboard; lists cut at their edge without a fade.
- **By an independent UX, copy and accessibility pass** (a reviewing subagent reading the source
  and the screenshots): the ribbon moved silently on a turn (the take-back above); a section
  opened from the dock over the book closed to the scene; focus was lost after a card opened from
  the list, after the ribbon was moved and after "Read"; the "not saved" notice was unreadable on
  the dark sheet; no focus ring on the contents; a fight without a title showed its key; button
  names that did not begin with their visible words; "Later" on free chapters read as a lock and
  was removed; the right page's picture was too tall for a tablet; the book's Russian used other
  words than the product's.

## Verification

| Check                                                                                                                               | Result                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `pnpm run format:check`, `lint`, `typecheck`, `context-budget`                                                                      | pass (2,946 files)            |
| `pnpm run test` (unit)                                                                                                              | pass, 5,082 tests             |
| of them new: the screen's model 9, the server's source and routes 8                                                                 | pass                          |
| `pnpm run build`                                                                                                                    | pass                          |
| Integration (PostgreSQL): the place store, the table list of a moved campaign, migration 0049                                       | pass, 11 tests in three files |
| Journeys, Chromium: `dm-book` (two), `dm-book-library` (a family and a collection campaign)                                         | pass                          |
| Journeys for the changed shell: `dm-screen`, `section-screens`, `language-ru`, `dock`, `hub-library`, `client-errors` — fifteen     | pass                          |
| Layout audit at 1440, 1180, 1024, 768 and 390 px: opening, page, person, moment, contents; Ravenford, the lighthouse, Ash Testament | no finding of the book's left |
| Axe (in the journeys): the opening, an open card, the contents, a library page                                                      | pass                          |

Not run: the whole integration suite and the whole journey suite (CI runs them on the pull
request); the iPad project (Stage 930 adds the book's journey to it); a real tablet.

The audit still names one thing that is not the book's: the scene's "in this scene" strip is cut
by the stage under any open section at some sizes. It is there on `main`; not touched.

## Risks and what is open

- **Escape with a card open closes the whole book**, as it closes any section. Closing the card
  first would be kinder; not done.
- **The Book's glyph** is the theatre masks: the open book is the Session's, the quill the
  Chronicle's, the scroll History's. A glyph of its own belongs with the book's own materials
  (Stage 950).
- **"There is a lead"** depends on the clues' `subjects` in the campaigns' sources; it was checked
  on a made-up book in unit tests, not on a played campaign.
- **Paging** was looked at in Chromium at five sizes with three typefaces; WebKit on a real iPad
  was not.
- **A campaign started from a package edited so far that a key the book names is gone has no
  book.** That is the rule (ADR 0074 §3.1), stated here so that it is not a surprise.
- Migration 0049 was applied to this machine's development database by the integration run.

## Next

Stage 930, `work-orders/STAGE_930.md`: a moment is played from its card.
