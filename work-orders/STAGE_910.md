# Work Order — Stage 910: the book's data

Authority: the owner's words of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`), Stages
900–930 without stops; program `docs/DM_BOOK_PLAN.md` (section 910); ADR 0074 §2, written with the
stage. Branch `claude/stage-910-book-data`, stacked on Stage 900's.

A campaign's package gains its book: the chapters and scenes its source already holds, in a shape
the game can show. No model writes anything in this stage.

## Deliver

1. **The contract** (`packages/contracts/src/campaign/`): an optional `book` in the campaign
   package — chapters in the campaign's own order; for a chapter its words to read aloud, its
   goal, the DM's note, how long it plays, where it may stop, its ending, rewards and
   consequences, the people, clues and handouts it names; for a page (a scene) its title, its
   text as written, its minutes, the choices, the check line, what follows a failure; a puzzle
   where the chapter has one; the campaign's handouts; the order of chapters (which follow one
   another, which are free, what a chapter needs) where the source states it. Absent from
   packages saved before this stage, as `possessions` and `maps` are.
2. **The check as fields**, beside the line as written: skills and DC where the line names them
   in a form that can be read with certainty ("Восприятие или расследование DC 10", "Атлетика
   СЛ 12"), "no roll" where it says so, nothing where it does not. The line as written always
   stays.
3. **Links to people**: where an NPC of the cast is named in a page's text, the page records the
   words and the person. Russian case endings are matched by the name's stem; a name that
   matches two people makes no link.
4. **Which layer**: a page says its text is the campaign's own, and whether that text speaks to
   the players or to the DM (decision 12 of the plan), by a rule written in the ADR.
5. **The builds**: every series' package build writes the book (`scripts/lighthouse/`,
   `scripts/acorn-express/`, `scripts/moon-pearl/`, `scripts/campaign-collection/`,
   `scripts/dark-fantasy/`, `scripts/fantasy-campaigns/`, `scripts/mixed-campaigns/`,
   `scripts/noir-campaigns/`, shared code in `scripts/campaign-shared/`); all 53 `package.json`
   files and the library fixture (`fixtures/campaign-library/`) are regenerated.
6. **The two built-in adventures**: Hollowmere's pages from `docs/design/dm-book/story.js`,
   Ravenford's written by the session from `docs/BUILTIN_ADVENTURES_DM_RU.md`. Ravenford's pages
   carry a flag that keeps them out of the book until the owner has read them; the report quotes
   them in full for that reading.
7. **Checks of the data**, as tests that run over every package: each link, clue, handout and
   encounter a page names exists; each chapter of the source is in the book and each scene is a
   page; no page's text holds a cast member's `secret` or a clue's hidden statement beyond what
   the source's own scene text says; the counts in the plan (434 chapters, 1,323 scenes) hold.

## Session's decisions (each may be overruled)

- All of ADR 0074 §2.
- The book is compiled into nothing: it is package content read by the DM's client in Stage 920.
  The plan compiler and the World Engine do not read it; `story.ts` checks its references.
- No change to `situations`, `firstSession` or `laterOutline`: what reads them today keeps
  working.
- Variants of a campaign for other party sizes (`variants/`) get the same book; a difference a
  variant states for a scene is the variant's own text.

## Boundaries

A protected contract changes: this work order and ADR 0074 §2 are the owner's decision for it
(the record's `authorizedStages`). No server route, no client code, no migration. No paid call. A
package is generated, never edited by hand. Nothing is merged or deployed.

## Checks

- Unit: the contract's shape and limits; the check reader on every distinct form found in the
  sources, with the forms it refuses; the name matcher on case endings and on two people with one
  stem; the build of one campaign of each series against a snapshot of its book.
- The whole library: the data checks of item 7 over all 55.
- Format, lint, typecheck, the context budget, the unit suite, the campaign suites
  (`lighthouse:check`, `acorn:check`, `pearl:check` and the series' tests), the library build.
