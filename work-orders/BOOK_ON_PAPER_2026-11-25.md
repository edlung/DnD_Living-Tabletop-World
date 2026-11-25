# Every slip and window on the book's paper

The second of the interface's loose ends the owner asked to have finished
(`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`): «Закончи сначала все недоделки интерфейса».
ADR 0075 §27. Stacked on `claude/book-fight-whole-screen` (pull request 108).

## Scope

- **Slips over a page** (`styles/book-slips.css`; `exploration/action-notice.tsx`,
  `alerts/table-asks.tsx` take the paper's surface): the result of an action and what was learned;
  what the table asks (a check, a rest, a pause, a break, a handout).
- **Small windows as slips of paper**: how to play, about the game, "What can I do?", the table's
  agreement, signing out, saving a seat, deleting an account, a hero's builder, a new level —
  each marked `data-surface='paper'`; their controls set as a page sets them where no page does.
- **The Chronicle's head** set as the book's head: index tabs, a stamped label, the drawn cross;
  the chapter writer's form a slip.
- **A phone's fight on a page of paper** (`combat/fold-out.ts`: the fold-out's surface is paper
  wherever the fight is in a book).
- **Lists of entries as an index** (the Journal's known people and places, the places to go, the
  glossary, the DM's tools): lines under hairlines, not rows of boxes.
- **The Dice page's picker** uses the book's drawn dice, as the page's foot does.

## Out of scope

The shelf, the way in, the table's screen and the workshop; the choices and lists the browser
still draws (the next stage); every command, route and contract; merging and deployment.

## Acceptance

- No page, window or slip of the DM's or a hero's book paints dark glass at 766 × 799,
  1024 × 768, 1440 × 900 or on a phone (the session's `dark-tour` over every page lists none but
  the Chronicle's desk and the cover's cloth).
- Each window keeps its words, its order of controls, its focus and its Escape.
- Static checks, unit tests and the journeys pass; the layout audit of the windows and slips is
  clean.
- Every new phrase of the interface is listed for the owner (there is none).
