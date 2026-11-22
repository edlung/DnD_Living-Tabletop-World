# Work Order — Stage 910: the book's data

Authority: the owner's words of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`), Stages
900–930 without stops; program `docs/DM_BOOK_PLAN.md` (section 910); ADR 0074 §2, written with the
stage. Branch `claude/stage-910-book-data`, stacked on Stage 900's.

Every campaign gets its book: the chapters and scenes its source already holds, in a shape the
game can show. No model writes anything for the 53 authored campaigns in this stage.

**Changed while the stage was done (2026-11-22).** The order first said "an optional `book` in the
campaign package". Measured: a package may be 512 KB at most, the largest shipped one is 453 KB, a
book is up to 252 KB and would repeat in each of a campaign's four to seven packages. The book is a
document beside the packages (ADR 0074 §2.1). Items 1 and 5 below are as done.

## Deliver

1. **The contract** (`packages/contracts/src/campaign/book.ts`): `campaignBookSchema`, a document
   of its own — chapters in the campaign's own order; for a chapter its words to read aloud, its
   goal, the DM's note, how long it plays, its ending, rewards and consequences, the people, clues,
   handouts and encounters it names; for a page (a scene) its title, its text as written, its
   minutes, the choices, the check line, what follows a failure; a puzzle where the chapter has
   one; the campaign's handouts, cast and clues as the DM reads them; its notes on a changed plan.
   The package contract does not change.
2. **The check as fields**, beside the line as written: skills and DC where the line names them
   in a form that can be read with certainty ("Восприятие или расследование DC 10", "Атлетика
   СЛ 12"), "no roll" where it says so, nothing where it does not. The line as written always
   stays.
3. **Links to people**: where an NPC of the cast is named in a page's text, the page records the
   words and the person. Russian case endings are matched by the name's stem; a name that
   matches two people makes no link.
4. **Which layer**: a page says its text is the campaign's own, and whether that text speaks to
   the players or to the DM (decision 12 of the plan), by a rule written in the ADR.
5. **The build**: the library's build (`scripts/campaign-library/`, the book in `book/`) writes
   `fixtures/campaign-library/<id>/book.json` for all 53 and names it in `library.json`; the
   server's library loader reads and verifies it (`apps/server/src/campaigns/library.ts`,
   `bookFor`). No series build and no `package.json` changes.
6. **The two built-in adventures** (`scripts/adventures/books/`): Hollowmere's pages from
   `docs/design/dm-book/story.js`, Ravenford's written by the session from its seed and
   `docs/BUILTIN_ADVENTURES_DM_RU.md`. Both books carry a flag that keeps them closed until the
   owner has read them; the report quotes Ravenford's pages in full for that reading.
7. **Checks of the data**, as tests that run over every book: each person, clue, handout and
   encounter a page names exists in every variant's package; each chapter of the source is in the
   book and each scene is a page, word for word; the counts in the plan (434 chapters, 1,323
   scenes) hold.

## Session's decisions (each may be overruled)

- All of ADR 0074 §2.
- The book is compiled into nothing: it is library content read by the DM's client in Stage 920.
  The plan compiler and the World Engine do not read it; `bookReferenceProblems` checks its keys.
- No change to packages: `situations`, `firstSession`, `laterOutline` and every digest stay.
- One book serves every variant of a campaign; a test holds that each key exists in each.
- Hollowmere's book waits for the owner's reading as Ravenford's does: its text was written by a
  model in another session, and the owner's rule of 2026-11-21 covers it.

## Boundaries

No protected contract changes: the book's contract is new, the package's is untouched. No server
route (the loader only), no client code, no migration. No paid call. A package and a book are
generated, never edited by hand. Nothing is merged or deployed.

## Checks

- Unit: the contract's shape and limits; the check reader on every distinct form found in the
  sources, with the forms it refuses; the name matcher on case endings and on two people with one
  stem; the encounter rules; the built-in books against their seeds.
- The whole library: the data checks of item 7 over all 53 books; `library.test.ts` holds each
  `book.json` to what the source builds now.
- Format, lint, typecheck, the context budget, the unit suite, build; the library's integration
  tests against PostgreSQL.
