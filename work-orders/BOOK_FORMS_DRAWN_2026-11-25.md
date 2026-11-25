# What the browser still drew in a form

The third of the interface's loose ends the owner asked to have finished
(`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`; his earlier words on the forms: «радиокнопки,
выпадающие списки, формы ввода»). ADR 0075 §28. Stacked on `claude/book-on-paper` (pull request
109).

## Scope

- **The list a select opens** (`styles/book-lists.css`): a slip of the book's paper with inked
  options, where the browser lets a page set it; the list of views behind the cover's clasp
  too.
- **The paper before any book** (the way in, a shelf's label, the account's page, a library
  book's look): a page's stamped labels, ledger fields and lists (`styles/book-slips.css`).
- **A date and time's mark**: the page's clock in the rubric's red.
- **A page's scroll bar**: a thin stroke of the page's ink.
- **A tile's long word** breaks at a syllable with a hyphen (`styles/book-picks.css`; it landed
  with pull request 109's commit).

## Out of scope

Turning the remaining lists into tiles or faces (each changes a form's controls and its
journeys); a date picker of the book's own; number fields' steppers; every command, route and
contract; merging and deployment.

## Acceptance

- In Chromium an opened list on a page, in a paper window and behind the clasp is the book's
  paper with the chosen option in the rubric's red; `selectOption` and the keyboard work as
  before.
- Static checks, unit tests and the journeys that choose from lists pass; the layout audit of
  the pages looked at is clean.
- Every new phrase of the interface is listed for the owner (there is none).
