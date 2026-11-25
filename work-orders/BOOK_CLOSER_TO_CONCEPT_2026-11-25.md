# The book closer to the concept, forms drawn

The owner, 2026-11-25, on the whole-screen book (pull request 106): «а можно еще ближе к
концепту? стандартные формы можно заменить сгенерированными значками где только можно?»
(`reviews/OWNER_BOOK_CLOSER_TO_CONCEPT_2026-11-25.json`). ADR 0075 §25. Stacked on
`claude/book-full-screen` (pull request 106). The concept he chose: direction А, a real book
(`~/Documents/living-tabletop-world-art/book-polish-2026-11-24/out/dm-a-real-book.png`).

## Scope

- **The Scene's spread from 701 px** (`world/scene-spread.ts`): a window some 760 px wide — the
  owner's own — is two pages, not a picture under glass plates.
- **The DM's working spread set as the concept sets it** (`styles/book-concept.css`,
  `styles/work-spread.css`): each page under its running head; the right page in its own flow —
  the head (the place, the day and the hour), the plate in a frame, the table's faces on a rule,
  who and what is here as round portraits, the seals; the ribbon down the gutter; from 1024 px
  the dice at the right page's foot and the story's page to the foot of the book.
- **The story's leaf, one print in two places** (`styles/book-leaf.css`; `book/work-story.tsx`,
  `book/book-sheet.tsx`): the title in the page's middle over the book's ornament; at the foot the
  ornament, the page's number and the hands that turn the page.
- **A spread without the story** (a hero's Scene; a DM's whose campaign has no written book): the
  same head, ornament and round portraits.
- **Drawn choices** (`book-kit/pick.tsx`, `book-kit/hero-tiles.tsx`, `styles/book-picks.css`):
  tiles in place of bare radio buttons (where the session is played, the table's tone, how to
  roll, what the screens show, damage or healing, a journey's pace) and of short lists (the
  weather, who is surprised); the heroes' faces in place of lists of their names (whom a check is
  asked of, whom a handout is for); a vignette on a rest's buttons, a hero's card's actions,
  "Start the session", "More dice"; a drawn cross where a page, a card or a slip closes.
- **A form's own marks, drawn**: the tick box, the ring of a choice kept as a row, the mark of a
  list, the fold of a page.
- **Pictures by Codex CLI**: fifty-six vignettes in one engraved style (the product's own set,
  `pick-*`); the build trims a book's ribbon to a band and its divider to a flourish
  (`scripts/book-materials/build.ts`); the generated stylesheet moves under `generated/`.
- **The journeys** choose from the tiles; a unit test keeps a picture for every drawn choice.

## Out of scope

The seals, initial, corner, ornament and emblem of the fifty-three books that have none yet (they
keep the product's drawn wax and a hairline); the table's screen, the shelf, the way in, the
workshop and the Chronicle's own dialog; lists whose options are the world's own names (a
creature, a spell, a place) — they stay lists, with the drawn mark; a hero's builder; merging and
deployment.

## Acceptance

- At 766 × 799, 1024 × 768 and 1440 × 900 the DM's Scene is a spread set as the concept sets it;
  nothing of it lies under another part or is cut.
- Every choice named in the scope is made by pressing a picture; each keeps its name and its
  group's name for a reader of the screen and for the keyboard.
- Static checks, unit tests and the journeys pass; the layout audit of the changed pages is clean.
- Every new phrase of the interface is listed for the owner (there is none beyond a page's
  number: the words are the ones the pages had).
